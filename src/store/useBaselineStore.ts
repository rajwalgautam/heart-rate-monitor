import { create } from 'zustand';
import {
  checkAvailability,
  isRateLimitError,
  readHeartRateRecords,
  requestPermissions,
} from '@/healthconnect/client';
import { calculateBaseline, newestSampleTime } from '@/healthconnect/utils';
import {
  BASELINE_POLL_INTERVAL_MS,
  MIN_MANUAL_REFRESH_INTERVAL_MS,
  RATE_LIMIT_BACKOFF_BASE_MS,
  RATE_LIMIT_BACKOFF_MAX_MS,
} from '@/constants/health';
import type { HealthConnectStatus } from '@/types';

/** Timer handle in module scope, for the same reason as the BLE disposers. */
let pollTimer: ReturnType<typeof setInterval> | null = null;

/** Timestamp of the last accepted fetch, backing the manual-refresh debounce. */
let lastFetchAt = 0;

/** Newest sample seen, backing the dedupe. See D2. */
let lastNewestSample: number | null = null;

/** Current backoff delay; 0 when not backing off. */
let backoffMs = 0;

/** When the backoff expires. Polls before this are skipped. */
let backoffUntil = 0;

interface BaselineState {
  baselineHeartRate: number | null;
  lastUpdated: number | null;
  isLoading: boolean;
  status: HealthConnectStatus;
  /** True after a rate-limit backoff: the shown value is known to be old. */
  isStale: boolean;
  error: string | null;

  /** Check availability and prompt for permission if needed. */
  initialize: () => Promise<void>;
  requestAccess: () => Promise<void>;
  /** Read Health Connect. Respects the active backoff. */
  fetchBaseline: () => Promise<void>;
  /** User-triggered refresh, debounced by MIN_MANUAL_REFRESH_INTERVAL_MS. */
  refreshNow: () => Promise<void>;
  startPolling: () => void;
  stopPolling: () => void;
}

export const useBaselineStore = create<BaselineState>((set, get) => ({
  baselineHeartRate: null,
  lastUpdated: null,
  isLoading: false,
  status: 'unknown',
  isStale: false,
  error: null,

  initialize: async () => {
    const status = await checkAvailability();
    set({ status });
    if (status === 'available') {
      await get().fetchBaseline();
    }
  },

  requestAccess: async () => {
    const status = await requestPermissions();
    set({ status });
    if (status === 'available') {
      await get().fetchBaseline();
    }
  },

  fetchBaseline: async () => {
    if (get().status !== 'available') return;
    if (Date.now() < backoffUntil) return;

    set({ isLoading: true });
    try {
      const now = Date.now();
      const records = await readHeartRateRecords(now);
      lastFetchAt = now;

      // Dedupe: at 30s against a source that writes every 1-5 minutes, most
      // reads are identical to the last. Skipping the state write avoids
      // re-rendering the dashboard for no new information.
      const newest = newestSampleTime(records);
      if (newest !== null && newest === lastNewestSample) {
        set({ isLoading: false, isStale: false, error: null });
        return;
      }
      lastNewestSample = newest;

      // A successful read clears any backoff.
      backoffMs = 0;
      backoffUntil = 0;

      set({
        baselineHeartRate: calculateBaseline(records, now),
        lastUpdated: now,
        isLoading: false,
        isStale: false,
        error: null,
      });
    } catch (error) {
      if (isRateLimitError(error)) {
        // Non-fatal by design: keep the last known value visible and mark it
        // stale rather than blanking the card. See D2.
        backoffMs =
          backoffMs === 0
            ? RATE_LIMIT_BACKOFF_BASE_MS
            : Math.min(backoffMs * 2, RATE_LIMIT_BACKOFF_MAX_MS);
        backoffUntil = Date.now() + backoffMs;
        set({ isLoading: false, isStale: true, error: 'Health Connect is rate limiting.' });
        return;
      }
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to read Health Connect.',
      });
    }
  },

  refreshNow: async () => {
    if (Date.now() - lastFetchAt < MIN_MANUAL_REFRESH_INTERVAL_MS) return;
    await get().fetchBaseline();
  },

  startPolling: () => {
    // Restarting must not leave the previous interval running.
    get().stopPolling();
    pollTimer = setInterval(() => {
      void get().fetchBaseline();
    }, BASELINE_POLL_INTERVAL_MS);
  },

  stopPolling: () => {
    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  },
}));

/** Test seam: reset module-scope timers and dedupe/backoff bookkeeping. */
export function __resetBaselineModuleState(): void {
  if (pollTimer !== null) clearInterval(pollTimer);
  pollTimer = null;
  lastFetchAt = 0;
  lastNewestSample = null;
  backoffMs = 0;
  backoffUntil = 0;
}
