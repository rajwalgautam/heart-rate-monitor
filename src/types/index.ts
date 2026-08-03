// Domain types for Heart Rate Monitor. See implementation.md §5.3.
//
// Nothing from `react-native-ble-plx` or `react-native-health-connect` is
// re-exported here: everything crossing out of `src/ble/` or
// `src/healthconnect/` is normalized to one of these shapes first.

/** A BLE peripheral advertising the Heart Rate Service. */
export interface BleDevice {
  id: string;
  name: string | null;
  rssi: number | null;
}

export type ConnectionState =
  | 'disconnected'
  | 'scanning'
  | 'connecting'
  | 'connected';

/** Health Connect availability. Drives the degraded path — see D4. */
export type HealthConnectStatus =
  | 'unknown'
  | 'available'
  /** Not installed, or not supported on this device. */
  | 'unavailable'
  | 'permission-denied';

/** A completed or in-progress monitoring session. */
export interface Session {
  readonly id: number;
  startTime: number;
  endTime: number | null;
  avgHr: number | null;
  maxHr: number | null;
  createdAt: number;
}

/** One heart rate sample captured during a session. */
export interface SessionReading {
  readonly id: number;
  sessionId: number;
  timestamp: number;
  hrValue: number;
}

/**
 * A single Health Connect heart rate sample, flattened out of the nested
 * `samples` array on a `HeartRateRecord`. See implementation.md §5.1.
 */
export interface HeartRateSample {
  /** Epoch milliseconds. */
  time: number;
  beatsPerMinute: number;
}

/**
 * The shape we consume from Health Connect's `HeartRateRecord`. Declared
 * structurally rather than imported so the pure baseline logic stays free of
 * native dependencies and runs in the `unit` Jest project.
 */
export interface HeartRateRecordLike {
  samples: Array<{
    /** ISO 8601 string, as Health Connect returns it. */
    time: string;
    beatsPerMinute: number;
  }>;
}

// ---- Settings / theme ----

export type ThemeMode = 'light' | 'dark' | 'system';
