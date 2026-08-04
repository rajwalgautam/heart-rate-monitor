import { create } from 'zustand';
import * as Ble from '@/ble/BleManager';
import type { Disposer } from '@/ble/BleManager';
import { createSession, finalizeSession, insertReading } from '@/db/queries';
import type { BleDevice, ConnectionState, Session } from '@/types';

/**
 * Disposers live in module scope, not store state.
 *
 * They are not rendering data, and keeping them out of the store means a
 * re-render can never drop a handle to a running scan or subscription — which
 * is exactly how a "stopped" scan keeps draining the battery. See
 * implementation.md §8.1.
 */
let scanDisposer: Disposer | null = null;
let readingDisposer: Disposer | null = null;
let disconnectDisposer: Disposer | null = null;

/**
 * Running summary for the active session (D3).
 *
 * `avg_hr`/`max_hr` come from here rather than a `SELECT AVG(...)` at session
 * end, so the summary stays correct even if an individual reading insert fails.
 */
interface Accumulator {
  count: number;
  sum: number;
  max: number;
}

let accumulator: Accumulator = { count: 0, sum: 0, max: 0 };

function resetAccumulator(): void {
  accumulator = { count: 0, sum: 0, max: 0 };
}

interface HeartRateState {
  connectionState: ConnectionState;
  connectedDevice: BleDevice | null;
  liveHeartRate: number | null;
  discoveredDevices: BleDevice[];
  activeSession: Session | null;
  error: string | null;

  startScan: () => Promise<void>;
  stopScan: () => void;
  connectToDevice: (deviceId: string) => Promise<void>;
  disconnect: () => Promise<void>;
  startSession: () => Promise<void>;
  endSession: () => Promise<void>;
  /** Release every BLE resource. Idempotent — see §8.1 rule 3. */
  teardown: () => void;
  clearError: () => void;
}

export const useHeartRateStore = create<HeartRateState>((set, get) => ({
  connectionState: 'disconnected',
  connectedDevice: null,
  liveHeartRate: null,
  discoveredDevices: [],
  activeSession: null,
  error: null,

  startScan: async () => {
    // Starting a scan while one runs would leak the first disposer.
    get().stopScan();

    const granted = await Ble.requestPermissions();
    if (!granted) {
      set({ error: 'Bluetooth permission denied.', connectionState: 'disconnected' });
      return;
    }

    const ready = await Ble.isBluetoothReady();
    if (!ready) {
      set({ error: 'Bluetooth is off.', connectionState: 'disconnected' });
      return;
    }

    set({ connectionState: 'scanning', discoveredDevices: [], error: null });

    scanDisposer = Ble.scanForDevices(
      (device) => {
        set((state) =>
          state.discoveredDevices.some((d) => d.id === device.id)
            ? state
            : { discoveredDevices: [...state.discoveredDevices, device] },
        );
      },
      (error) => {
        set({ error: error.message, connectionState: 'disconnected' });
        get().stopScan();
      },
    );
  },

  stopScan: () => {
    scanDisposer?.();
    scanDisposer = null;
    set((state) =>
      state.connectionState === 'scanning'
        ? { connectionState: 'disconnected' }
        : state,
    );
  },

  connectToDevice: async (deviceId) => {
    get().stopScan();
    set({ connectionState: 'connecting', error: null });

    try {
      const device = await Ble.connectToDevice(deviceId);

      // No device id: subscribe operates on the instance `connectToDevice`
      // just discovered. See BleManager for why that matters.
      readingDisposer = Ble.subscribeHeartRate(
        (bpm) => {
          set({ liveHeartRate: bpm });

          const session = get().activeSession;
          if (session === null) return;

          accumulator = {
            count: accumulator.count + 1,
            sum: accumulator.sum + bpm,
            max: Math.max(accumulator.max, bpm),
          };
          // Fire-and-forget: a failed insert must not interrupt the live
          // stream, and the summary comes from the accumulator regardless.
          void insertReading(session.id, bpm).catch(() => undefined);
        },
        (error) => set({ error: error.message }),
      );

      disconnectDisposer = Ble.onDisconnected(deviceId, () => {
        set({
          connectionState: 'disconnected',
          connectedDevice: null,
          liveHeartRate: null,
          error: 'Device disconnected.',
        });
        readingDisposer?.();
        readingDisposer = null;
      });

      set({ connectionState: 'connected', connectedDevice: device });
    } catch (error) {
      set({
        connectionState: 'disconnected',
        connectedDevice: null,
        error: error instanceof Error ? error.message : 'Failed to connect.',
      });
    }
  },

  disconnect: async () => {
    const device = get().connectedDevice;

    readingDisposer?.();
    readingDisposer = null;
    disconnectDisposer?.();
    disconnectDisposer = null;

    if (device !== null) {
      await Ble.disconnect(device.id);
    }

    set({
      connectionState: 'disconnected',
      connectedDevice: null,
      liveHeartRate: null,
    });
  },

  startSession: async () => {
    if (get().activeSession !== null) return;
    resetAccumulator();
    const session = await createSession();
    set({ activeSession: session });
  },

  endSession: async () => {
    const session = get().activeSession;
    if (session === null) return;

    const { count, sum, max } = accumulator;
    const summary = {
      endTime: Date.now(),
      avgHr: count > 0 ? Math.round(sum / count) : null,
      maxHr: count > 0 ? max : null,
    };

    // Clear state first: the UI should leave session mode even if the write
    // fails, and a stuck "ending" state is worse than a lost summary.
    set({ activeSession: null });
    resetAccumulator();

    await finalizeSession(session.id, summary);
  },

  teardown: () => {
    scanDisposer?.();
    scanDisposer = null;
    readingDisposer?.();
    readingDisposer = null;
    disconnectDisposer?.();
    disconnectDisposer = null;
  },

  clearError: () => set({ error: null }),
}));

/** Test seam: reset module-scope handles between specs. */
export function __resetHeartRateModuleState(): void {
  scanDisposer = null;
  readingDisposer = null;
  disconnectDisposer = null;
  resetAccumulator();
}
