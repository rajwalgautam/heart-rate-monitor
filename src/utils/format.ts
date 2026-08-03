/** Presentation helpers. Pure — covered by the `unit` project. */

/**
 * Elapsed time as `M:SS`, or `H:MM:SS` once past an hour. Used by the session
 * timer, which ticks once a second.
 */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number): string => String(n).padStart(2, '0');
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
}

/**
 * Coarse "how old is this" label for the baseline card. Deliberately low
 * resolution — the underlying data only moves every 1-5 minutes, so a
 * second-by-second counter would imply a precision the source does not have.
 */
export function formatRelativeTime(
  timestamp: number | null,
  now: number = Date.now(),
): string {
  if (timestamp === null) return 'Never';

  const elapsed = now - timestamp;
  if (elapsed < 0) return 'Just now';

  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes === 1) return '1 min ago';
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours === 1) return '1 hour ago';
  if (hours < 24) return `${hours} hours ago`;

  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

/**
 * Live heart rate relative to the 24h baseline, e.g. "+18 vs baseline".
 * Returns null when either side is unknown, so the caller renders nothing
 * rather than a comparison against a missing number.
 */
export function formatBaselineDelta(
  live: number | null,
  baseline: number | null,
): string | null {
  if (live === null || baseline === null) return null;
  const delta = live - baseline;
  if (delta === 0) return 'At baseline';
  const sign = delta > 0 ? '+' : '−';
  return `${sign}${Math.abs(delta)} vs baseline`;
}
