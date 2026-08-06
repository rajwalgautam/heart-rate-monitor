// Active-tracking sampling cadence. See implementation.md D5.

/**
 * How often an active session records a point.
 *
 * The BLE strap streams roughly one reading per second; this is the rate at
 * which those readings are folded into a single point, written to
 * `session_readings`, and plotted. The live BPM readout is deliberately *not*
 * throttled by this — it keeps updating at the stream's own rate.
 */
export interface TrackingIntervalOption {
  ms: number;
  /** Short form for the settings control. */
  label: string;
}

export const TRACKING_INTERVALS: readonly TrackingIntervalOption[] = [
  { ms: 5_000, label: '5s' },
  { ms: 15_000, label: '15s' },
  { ms: 30_000, label: '30s' },
  { ms: 60_000, label: '1m' },
  { ms: 300_000, label: '5m' },
] as const;

export const DEFAULT_TRACKING_INTERVAL_MS = 15_000;

export const MIN_TRACKING_INTERVAL_MS = 5_000;
export const MAX_TRACKING_INTERVAL_MS = 300_000;

/** Whether a stored value is one of the offered presets. */
export function isValidTrackingInterval(ms: unknown): ms is number {
  return typeof ms === 'number' && TRACKING_INTERVALS.some((o) => o.ms === ms);
}

/**
 * Points kept in memory for the live chart. At 5s a session would accumulate
 * 720 points/hour; the chart downsamples for rendering, but the series itself
 * is capped so a very long session cannot grow without bound. Persisted rows
 * are unaffected — this is only the in-memory window.
 */
export const MAX_LIVE_CHART_POINTS = 720;
