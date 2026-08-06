// Pure interval-summary logic for active tracking. No native imports.

import type { IntervalSummary } from '@/types';

/**
 * Fold the BLE readings collected during one interval into a single point.
 *
 * The mean is the recorded value; the range is kept alongside it because the
 * mean alone hides what a long interval actually contained — at 5 minutes a
 * point covers ~300 readings, and a flat 118 looks identical whether the
 * wearer was steady or oscillating between 90 and 150.
 *
 * Returns null for an empty interval rather than a zeroed summary, so a gap in
 * the stream (strap slipped, out of range) is recorded as *no point* instead of
 * a false reading of 0.
 */
export function summarizeInterval(readings: readonly number[]): IntervalSummary | null {
  if (readings.length === 0) return null;

  let sum = 0;
  let min = readings[0];
  let max = readings[0];

  for (const value of readings) {
    sum += value;
    if (value < min) min = value;
    if (value > max) max = value;
  }

  return {
    mean: Math.round(sum / readings.length),
    min,
    max,
  };
}

/**
 * Cap an append-only series to its most recent `limit` entries.
 *
 * Returns the original array when it is already short enough, so the common
 * case allocates nothing and referential equality holds — which matters for a
 * value pushed into React state on every interval tick.
 */
export function capSeries<T>(series: readonly T[], limit: number): readonly T[] {
  if (series.length <= limit) return series;
  return series.slice(series.length - limit);
}
