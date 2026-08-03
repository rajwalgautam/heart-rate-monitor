// Pure baseline math over Health Connect records.
// No native imports — this file runs in the `unit` Jest project.

import { BASELINE_WINDOW_MS } from '@/constants/health';
import type { HeartRateRecordLike, HeartRateSample } from '@/types';

/**
 * Flatten the nested `samples` arrays of a `HeartRateRecord` list.
 *
 * This is the step that makes the baseline correct. Health Connect returns
 * records, each holding many intraday samples; averaging per record instead of
 * per sample silently over-weights sparse records and yields a plausible-looking
 * but wrong number. See implementation.md §5.1.
 *
 * Samples whose timestamp does not parse are dropped rather than becoming NaN.
 */
export function flattenSamples(records: HeartRateRecordLike[]): HeartRateSample[] {
  const flat: HeartRateSample[] = [];
  for (const record of records) {
    for (const sample of record.samples ?? []) {
      const time = Date.parse(sample.time);
      if (Number.isNaN(time)) continue;
      if (!Number.isFinite(sample.beatsPerMinute)) continue;
      flat.push({ time, beatsPerMinute: sample.beatsPerMinute });
    }
  }
  return flat;
}

/** Keep only samples inside the trailing window ending at `now` (inclusive). */
export function withinWindow(
  samples: HeartRateSample[],
  now: number,
  windowMs: number = BASELINE_WINDOW_MS,
): HeartRateSample[] {
  const cutoff = now - windowMs;
  return samples.filter((s) => s.time >= cutoff && s.time <= now);
}

/**
 * The 24-hour baseline: the arithmetic mean of every sample in the window,
 * rounded to a whole BPM.
 *
 * Returns null — never NaN or 0 — when there is nothing to average, so callers
 * can distinguish "no data yet" from "a real reading of zero".
 */
export function calculateBaseline(
  records: HeartRateRecordLike[],
  now: number = Date.now(),
  windowMs: number = BASELINE_WINDOW_MS,
): number | null {
  const samples = withinWindow(flattenSamples(records), now, windowMs);
  if (samples.length === 0) return null;
  const sum = samples.reduce((acc, s) => acc + s.beatsPerMinute, 0);
  return Math.round(sum / samples.length);
}

/**
 * Timestamp of the newest sample across all records, or null when there are
 * none. Backs the dedupe in `useBaselineStore`: polling at 30s against a source
 * that writes every 1–5 minutes means most reads are identical to the last, and
 * an unchanged newest-sample time is the cheap way to detect that. See D2.
 */
export function newestSampleTime(records: HeartRateRecordLike[]): number | null {
  const samples = flattenSamples(records);
  if (samples.length === 0) return null;
  return samples.reduce((max, s) => (s.time > max ? s.time : max), samples[0].time);
}
