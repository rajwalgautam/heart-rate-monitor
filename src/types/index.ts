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
  /**
   * Sampling cadence this session was recorded at, in ms. Stored per session
   * rather than read from settings at display time, so a historical chart keeps
   * the x-axis spacing it was actually captured with even after the preference
   * changes. Null for sessions recorded before active tracking existed.
   */
  intervalMs: number | null;
  createdAt: number;
}

/**
 * One recorded point in a session: the mean of every BLE reading in the
 * interval, plus that interval's range.
 *
 * `hrValue` is the mean rather than a single sample — at a 5-minute cadence a
 * lone sample would discard ~299 readings and let one spike define the point.
 * `hrMin`/`hrMax` retain the spread the mean hides, so the chart can show a
 * range band. Both are null for rows written before the range was recorded.
 */
export interface SessionReading {
  readonly id: number;
  sessionId: number;
  timestamp: number;
  hrValue: number;
  hrMin: number | null;
  hrMax: number | null;
}

/** A summarized interval, before it is persisted. */
export interface IntervalSummary {
  mean: number;
  min: number;
  max: number;
}

/** A point on the live or historical chart. */
export interface ChartPoint {
  timestamp: number;
  value: number;
  min: number | null;
  max: number | null;
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
