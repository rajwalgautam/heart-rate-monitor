// Façade over react-native-ble-plx. Nothing outside this file imports the
// library, and nothing from it leaks upward: scans emit `BleDevice`, the
// characteristic stream emits plain numbers.
//
// Every subscribe/scan call returns a disposer. That is what makes the resource
// lifecycle contract in implementation.md §8.1 enforceable rather than
// aspirational — a caller cannot start something it has no way to stop.

import { BleManager as PlxManager, type Device } from 'react-native-ble-plx';
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
 * The live `Device` instance, held from connect until disconnect.
 *
 * ble-plx scopes service discovery to a connection *and* to the `Device` object
 * that performed it. Monitoring a characteristic on a different instance — even
 * one for the same peripheral — fails with `ServiceNotFound`, because that
 * instance never ran discovery. Keeping the discovered instance here is what
 * guarantees connect and subscribe operate on the same object.
 */
let connected: Device | null = null;

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
 * Connect, discover services, and verify the peripheral actually exposes the
 * Heart Rate Service. Returns the normalized device so the caller can record
 * what it connected to (the advertised name is often only available
 * post-connection).
 *
 * The discovered `Device` is retained in module scope — see `connected`.
 */
export async function connectToDevice(deviceId: string): Promise<BleDevice> {
  // Android caches a peripheral's GATT service list by MAC address, independent
  // of what the peripheral currently serves. Without `refreshGatt`, a device
  // that was ever connected before its "broadcast heart rate" mode was turned
  // on keeps returning that stale (HR-service-less) cache forever, even after
  // the mode is enabled and services() ought to reflect it.
  const device = await getManager().connectToDevice(deviceId, {
    refreshGatt: 'OnConnected',
  });
  await device.discoverAllServicesAndCharacteristics();

  await assertHeartRateService(device);
  connected = device;

  return {
    id: device.id,
    name: device.name ?? null,
    rssi: device.rssi ?? null,
  };
}

/**
 * Fail early, and legibly, when a peripheral advertises `0x180D` but does not
 * expose it once connected.
 *
 * This is a real wearable behaviour, not a theoretical one: several trackers
 * gate the standard Heart Rate Service behind an explicit "broadcast heart
 * rate" mode and only serve it while that mode is on. Without this check the
 * user sees ble-plx's raw `Service <uuid> for device <id> not found`, which
 * reads like a bug in the app rather than something they can act on.
 */
async function assertHeartRateService(device: Device): Promise<void> {
  const services = await device.services();
  const hasHeartRate = services.some(
    (s) => s.uuid.toLowerCase() === HEART_RATE_SERVICE_UUID.toLowerCase(),
  );
  if (!hasHeartRate) {
    throw new Error(
      'This device connected but is not exposing the Heart Rate Service. ' +
        'If it has a "broadcast heart rate" or workout mode, turn that on and reconnect.',
    );
  }
}

/**
 * Subscribe to the Heart Rate Measurement characteristic on the already
 * connected device.
 *
 * Deliberately takes no device id and does no connecting. Connecting is
 * `connectToDevice`'s job; a subscribe that quietly opens its own connection is
 * what previously produced two `Device` instances where only the discarded one
 * had run discovery. Requiring a prior connect also lets the disposer be
 * synchronous rather than chaining off a pending promise.
 *
 * Packets that fail to parse are dropped silently rather than surfaced as
 * errors: a single garbled notification in a ~1/second stream is noise, and
 * raising it would flicker the UI into an error state for one bad frame.
 */
export function subscribeHeartRate(
  onReading: (bpm: number) => void,
  onError?: (error: Error) => void,
): Disposer {
  const device = connected;
  if (device === null) {
    onError?.(new Error('Not connected to a device.'));
    return () => undefined;
  }

  let subscription: { remove: () => void } | null = null;
  try {
    subscription = device.monitorCharacteristicForService(
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
    );
  } catch (error) {
    onError?.(error instanceof Error ? error : new Error(String(error)));
    return () => undefined;
  }

  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    subscription?.remove();
  };
}

/** Drop the connection. Safe to call when nothing is connected. */
export async function disconnect(deviceId: string): Promise<void> {
  connected = null;
  try {
    await getManager().cancelDeviceConnection(deviceId);
  } catch {
    // Already disconnected, or the device went out of range. Either way the
    // post-condition the caller wants — no connection — already holds.
  }
}

/** Notified when the peripheral drops out on its own (out of range, battery). */
export function onDisconnected(deviceId: string, callback: () => void): Disposer {
  const subscription = getManager().onDeviceDisconnected(deviceId, () => {
    // The retained instance is dead once the peripheral drops; holding it would
    // let a later subscribe monitor a stale connection.
    connected = null;
    callback();
  });
  return () => subscription.remove();
}

/** Test seam: drops the cached manager and connection so each spec starts clean. */
export function __resetManager(): void {
  manager = null;
  connected = null;
}
