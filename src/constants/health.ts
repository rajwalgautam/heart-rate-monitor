// Tunables for the passive Health Connect pipeline. See implementation.md D2.

/** Rolling window the baseline is averaged over. */
export const BASELINE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Foreground poll cadence while the Live tab is focused.
 *
 * Deliberately faster than the upstream write cadence — Fitbit syncs into
 * Health Connect every 1–5 minutes — so most polls return identical data and
 * are dropped by the dedupe in `useBaselineStore`. Reads are local (no network,
 * no peripheral battery cost), so oversampling is cheap.
 */
export const BASELINE_POLL_INTERVAL_MS = 30_000;

/**
 * Floor on manual refreshes. Google does not publish Health Connect's numeric
 * quotas, only that reads carry both a periodic and a daily limit, so a user
 * holding down the refresh button must not be able to spend them.
 */
export const MIN_MANUAL_REFRESH_INTERVAL_MS = 5_000;

/** First backoff step after a rate-limit error; doubles up to the max. */
export const RATE_LIMIT_BACKOFF_BASE_MS = 60_000;

/** Ceiling for the exponential backoff. */
export const RATE_LIMIT_BACKOFF_MAX_MS = 15 * 60 * 1000;
