// Façade over react-native-ble-plx. Nothing outside this file imports the
// library, and nothing from it leaks upward: scans emit `BleDevice`, the
// characteristic stream emits plain numbers.
//
// Every subscribe/scan call returns a disposer. That is what makes the resource
// lifecycle contract in implementation.md §8.1 enforceable rather than
// aspirational — a caller cannot start something it has no way to stop.

import { BleManager as PlxManager } from 'react-native-ble-plx';
import { PermissionsAndroid, Platform } from 'react-native';
import {
  HEART_RATE_MEASUREMENT_UUID,
  HEART_RATE_SERVICE_UUID,
  SCAN_TIMEOUT_MS,
} from '@/constants/ble';
import { parseHeartRateValue } from './utils';
import type { BleDevice } from '@/types';

/** Cancels whatever started it. Safe to call more than once. */
export type Disposer = () => void;

let manager: PlxManager | null = null;

/**
 * The ble-plx manager is created lazily: constructing it initializes the native
 * Bluetooth adapter, which we do not want to happen at module import time (it
 * would fire during a Jest import, and on app boot before any permission has
 * been granted).
 */
function getManager(): PlxManager {
  if (manager === null) {
    manager = new PlxManager();
  }
  return manager;
}

/**
 * Request the runtime permissions a scan needs, at connect time rather than app
 * launch. Android 12 (API 31) split Bluetooth out of location: below that, a BLE
 * scan still requires ACCESS_FINE_LOCATION.
 */
export async function requestPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  const apiLevel = typeof Platform.Version === 'number' ? Platform.Version : 0;
  const permissions =
    apiLevel >= 31
      ? [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];

  const granted = await PermissionsAndroid.requestMultiple(permissions);
  return permissions.every(
    (p) => granted[p] === PermissionsAndroid.RESULTS.GRANTED,
  );
}

/** True when the adapter is powered on and usable. */
export async function isBluetoothReady(): Promise<boolean> {
  const state = await getManager().state();
  return state === 'PoweredOn';
}

/**
 * Scan for peripherals advertising the Heart Rate Service.
 *
 * Deduplicates by device id — ble-plx re-emits the same peripheral on every
 * advertisement packet, which would otherwise churn the list several times a
 * second. Stops itself after `SCAN_TIMEOUT_MS` so a forgotten scan cannot drain
 * the battery indefinitely; the returned disposer stops it sooner.
 */
export function scanForDevices(
  onDevice: (device: BleDevice) => void,
  onError?: (error: Error) => void,
): Disposer {
  const seen = new Set<string>();
  let stopped = false;

  getManager().startDeviceScan(
    [HEART_RATE_SERVICE_UUID],
    null,
    (error, device) => {
      if (error !== null) {
        onError?.(error);
        return;
      }
      if (device === null || seen.has(device.id)) return;
      seen.add(device.id);
      onDevice({
        id: device.id,
        name: device.name ?? null,
        rssi: device.rssi ?? null,
      });
    },
  );

  const timeout = setTimeout(() => stop(), SCAN_TIMEOUT_MS);

  function stop(): void {
    if (stopped) return;
    stopped = true;
    clearTimeout(timeout);
    getManager().stopDeviceScan();
  }

  return stop;
}

/**
 * Connect and discover services. Returns the normalized device so the caller
 * can record what it actually connected to (the advertised name is often only
 * available post-connection).
 */
export async function connectToDevice(deviceId: string): Promise<BleDevice> {
  const device = await getManager().connectToDevice(deviceId);
  await device.discoverAllServicesAndCharacteristics();
  return {
    id: device.id,
    name: device.name ?? null,
    rssi: device.rssi ?? null,
  };
}

/**
 * Subscribe to the Heart Rate Measurement characteristic.
 *
 * Packets that fail to parse are dropped silently rather than surfaced as
 * errors: a single garbled notification in a ~1/second stream is noise, and
 * raising it would flicker the UI into an error state for one bad frame.
 */
export function subscribeHeartRate(
  deviceId: string,
  onReading: (bpm: number) => void,
  onError?: (error: Error) => void,
): Disposer {
  let removed = false;

  const subscription = getManager()
    .connectToDevice(deviceId)
    .then((device) =>
      device.monitorCharacteristicForService(
        HEART_RATE_SERVICE_UUID,
        HEART_RATE_MEASUREMENT_UUID,
        (error, characteristic) => {
          if (error !== null) {
            onError?.(error);
            return;
          }
          const bpm = parseHeartRateValue(characteristic?.value ?? null);
          if (bpm !== null) onReading(bpm);
        },
      ),
    )
    .catch((error: unknown) => {
      onError?.(error instanceof Error ? error : new Error(String(error)));
      return null;
    });

  return () => {
    if (removed) return;
    removed = true;
    // The subscription may still be resolving when teardown runs (a fast
    // navigate-away); chaining means it is removed whenever it lands.
    void subscription.then((sub) => sub?.remove());
  };
}

/** Drop the connection. Safe to call when nothing is connected. */
export async function disconnect(deviceId: string): Promise<void> {
  try {
    await getManager().cancelDeviceConnection(deviceId);
  } catch {
    // Already disconnected, or the device went out of range. Either way the
    // post-condition the caller wants — no connection — already holds.
  }
}

/** Notified when the peripheral drops out on its own (out of range, battery). */
export function onDisconnected(deviceId: string, callback: () => void): Disposer {
  const subscription = getManager().onDeviceDisconnected(deviceId, () => callback());
  return () => subscription.remove();
}

/** Test seam: drops the cached manager so each spec starts clean. */
export function __resetManager(): void {
  manager = null;
}
