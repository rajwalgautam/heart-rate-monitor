// Façade over react-native-health-connect. Read-only: this app never writes to
// Health Connect (implementation.md §5.1).
//
// Health Connect is not merely a library call — it may be absent, outdated, or
// permission-denied on a given device, and the app must stay useful as a
// live-BLE-only monitor in all three cases. See D4.

import {
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  readRecords,
  requestPermission,
  SdkAvailabilityStatus,
} from 'react-native-health-connect';
import { BASELINE_WINDOW_MS } from '@/constants/health';
import type { HealthConnectStatus, HeartRateRecordLike } from '@/types';

const HEART_RATE_PERMISSION = {
  accessType: 'read' as const,
  recordType: 'HeartRate' as const,
};

/**
 * Whether Health Connect can be used on this device, and whether we hold the
 * read permission. Never throws — an unavailable provider is an expected state,
 * not an error.
 */
export async function checkAvailability(): Promise<HealthConnectStatus> {
  try {
    const status = await getSdkStatus();
    if (status !== SdkAvailabilityStatus.SDK_AVAILABLE) return 'unavailable';

    const initialized = await initialize();
    if (!initialized) return 'unavailable';

    return (await hasPermission()) ? 'available' : 'permission-denied';
  } catch {
    return 'unavailable';
  }
}

async function hasPermission(): Promise<boolean> {
  const granted = await getGrantedPermissions();
  return granted.some(
    (p) =>
      p.recordType === HEART_RATE_PERMISSION.recordType &&
      p.accessType === HEART_RATE_PERMISSION.accessType,
  );
}

/**
 * Prompt for the heart rate read permission. Resolves to the resulting status
 * so the caller can react without a second availability round-trip.
 */
export async function requestPermissions(): Promise<HealthConnectStatus> {
  try {
    const status = await getSdkStatus();
    if (status !== SdkAvailabilityStatus.SDK_AVAILABLE) return 'unavailable';
    if (!(await initialize())) return 'unavailable';

    const granted = await requestPermission([HEART_RATE_PERMISSION]);
    const ok = granted.some(
      (p) =>
        p.recordType === HEART_RATE_PERMISSION.recordType &&
        p.accessType === HEART_RATE_PERMISSION.accessType,
    );
    return ok ? 'available' : 'permission-denied';
  } catch {
    return 'unavailable';
  }
}

/**
 * Read raw heart rate records covering the trailing baseline window.
 *
 * Raw records rather than Health Connect's `aggregate()` BPM_AVG: the
 * individual samples are what would make the deferred standard-deviation
 * feature additive instead of a rewrite (D2). Errors propagate — the caller
 * distinguishes a rate-limit error from other failures.
 */
export async function readHeartRateRecords(
  now: number = Date.now(),
  windowMs: number = BASELINE_WINDOW_MS,
): Promise<HeartRateRecordLike[]> {
  const result = await readRecords('HeartRate', {
    timeRangeFilter: {
      operator: 'between',
      startTime: new Date(now - windowMs).toISOString(),
      endTime: new Date(now).toISOString(),
    },
  });
  return (result.records ?? []) as HeartRateRecordLike[];
}

/**
 * Health Connect surfaces quota exhaustion as a message rather than a typed
 * error, and Google publishes no numeric quotas — so this matches on the
 * message text. A false negative just means the generic error path is taken,
 * which is also non-fatal.
 */
export function isRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /rate limit|quota/i.test(message);
}
