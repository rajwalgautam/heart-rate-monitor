import { create } from 'zustand';
import * as Ble from '@/ble/BleManager';
import type { Disposer } from '@/ble/BleManager';
import { createSession, finalizeSession, insertReading } from '@/db/queries';
import { summarizeInterval, capSeries } from '@/utils/tracking';
import {
  DEFAULT_TRACKING_INTERVAL_MS,
  MAX_LIVE_CHART_POINTS,
} from '@/constants/tracking';
import type { BleDevice, ChartPoint, ConnectionState, Session } from '@/types';

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

/**
 * Readings received since the last interval tick, and the timer that drains
 * them.
 *
 * Active tracking records one point per interval rather than one per BLE
 * notification: at a 5-minute cadence that is ~300 readings folded into a
 * single mean plus its range. The live BPM readout is deliberately *not* gated
 * by this timer — it updates on every notification, so the headline number
 * stays real-time while the recorded series stays at the chosen resolution.
 */
let intervalBucket: number[] = [];
let intervalTimer: ReturnType<typeof setInterval> | null = null;

function stopIntervalTimer(): void {
  if (intervalTimer !== null) {
    clearInterval(intervalTimer);
    intervalTimer = null;
  }
  intervalBucket = [];
}

interface HeartRateState {
  connectionState: ConnectionState;
  connectedDevice: BleDevice | null;
  liveHeartRate: number | null;
  discoveredDevices: BleDevice[];
  activeSession: Session | null;
  /** Points recorded so far in the active session, for the live chart. */
  sessionSeries: readonly ChartPoint[];
  error: string | null;

  startScan: () => Promise<void>;
  stopScan: () => void;
  connectToDevice: (deviceId: string) => Promise<void>;
  disconnect: () => Promise<void>;
  /** Begin active tracking at `intervalMs`, recording one point per interval. */
  startSession: (intervalMs?: number) => Promise<void>;
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
  sessionSeries: [],
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
          // Always live, regardless of the tracking interval — the headline
          // number reflects the strap, not the recording cadence.
          set({ liveHeartRate: bpm });

          if (get().activeSession === null) return;

          accumulator = {
            count: accumulator.count + 1,
            sum: accumulator.sum + bpm,
            max: Math.max(accumulator.max, bpm),
          };
          // Buffered until the interval timer drains it; the timer is what
          // writes to the database.
          intervalBucket.push(bpm);
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

  startSession: async (intervalMs = DEFAULT_TRACKING_INTERVAL_MS) => {
    if (get().activeSession !== null) return;

    resetAccumulator();
    stopIntervalTimer();

    const session = await createSession(intervalMs);
    set({ activeSession: session, sessionSeries: [] });

    intervalTimer = setInterval(() => {
      const summary = summarizeInterval(intervalBucket);
      intervalBucket = [];

      // An empty interval records no point. The strap dropping out for a
      // minute should leave a gap in the series, not a run of zeroes.
      if (summary === null) return;

      const point: ChartPoint = {
        timestamp: Date.now(),
        value: summary.mean,
        min: summary.min,
        max: summary.max,
      };

      set((state) => ({
        sessionSeries: capSeries([...state.sessionSeries, point], MAX_LIVE_CHART_POINTS),
      }));

      // Fire-and-forget: a failed insert must not interrupt tracking, and the
      // session summary comes from the accumulator regardless.
      void insertReading(session.id, summary, point.timestamp).catch(() => undefined);
    }, intervalMs);
  },

  endSession: async () => {
    const session = get().activeSession;
    if (session === null) return;

    // Drain whatever the final, partial interval collected before stopping —
    // otherwise ending a session always discards up to one interval of data,
    // which at 5 minutes is a lot to silently lose.
    const trailing = summarizeInterval(intervalBucket);
    stopIntervalTimer();

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

    if (trailing !== null) {
      await insertReading(session.id, trailing, summary.endTime).catch(() => undefined);
    }
    await finalizeSession(session.id, summary);
  },

  teardown: () => {
    scanDisposer?.();
    scanDisposer = null;
    readingDisposer?.();
    readingDisposer = null;
    disconnectDisposer?.();
    disconnectDisposer = null;
    // The interval timer is only stopped here when no session is running.
    // Teardown fires on backgrounding, and §8.1 rule 5 gives an active session
    // precedence — a backgrounded workout must keep recording.
    if (useHeartRateStore.getState().activeSession === null) {
      stopIntervalTimer();
    }
  },

  clearError: () => set({ error: null }),
}));

/** Test seam: reset module-scope handles between specs. */
export function __resetHeartRateModuleState(): void {
  scanDisposer = null;
  readingDisposer = null;
  disconnectDisposer = null;
  resetAccumulator();
  stopIntervalTimer();
}
