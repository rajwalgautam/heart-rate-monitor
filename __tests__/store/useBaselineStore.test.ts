import {
  useBaselineStore,
  __resetBaselineModuleState,
} from '@/store/useBaselineStore';
import {
  BASELINE_POLL_INTERVAL_MS,
  MIN_MANUAL_REFRESH_INTERVAL_MS,
} from '@/constants/health';
import type { HeartRateRecordLike } from '@/types';

jest.mock('@/healthconnect/client', () => ({
  checkAvailability: jest.fn(),
  requestPermissions: jest.fn(),
  readHeartRateRecords: jest.fn(),
  isRateLimitError: (error: unknown) =>
    /rate limit|quota/i.test(error instanceof Error ? error.message : String(error)),
}));

import {
  checkAvailability,
  readHeartRateRecords,
} from '@/healthconnect/client';

const mockCheckAvailability = checkAvailability as jest.MockedFunction<
  typeof checkAvailability
>;
const mockRead = readHeartRateRecords as jest.MockedFunction<
  typeof readHeartRateRecords
>;

/** One record whose single sample is `minutesAgo` old with the given BPM. */
function record(minutesAgo: number, bpm: number): HeartRateRecordLike {
  return {
    samples: [
      {
        time: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
        beatsPerMinute: bpm,
      },
    ],
  };
}

/** Put the store in the `available` state with a first reading already taken. */
async function primeStore(records: HeartRateRecordLike[]): Promise<void> {
  mockCheckAvailability.mockResolvedValue('available');
  mockRead.mockResolvedValue(records);
  await useBaselineStore.getState().initialize();
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetBaselineModuleState();
  useBaselineStore.setState({
    baselineHeartRate: null,
    lastUpdated: null,
    isLoading: false,
    status: 'unknown',
    isStale: false,
    error: null,
  });
});

afterEach(() => {
  useBaselineStore.getState().stopPolling();
  jest.useRealTimers();
});

describe('initialize', () => {
  it('fetches once when Health Connect is available', async () => {
    await primeStore([record(5, 70)]);
    expect(useBaselineStore.getState().status).toBe('available');
    expect(useBaselineStore.getState().baselineHeartRate).toBe(70);
    expect(mockRead).toHaveBeenCalledTimes(1);
  });

  it('does not read when Health Connect is unavailable', async () => {
    mockCheckAvailability.mockResolvedValue('unavailable');
    await useBaselineStore.getState().initialize();
    expect(useBaselineStore.getState().status).toBe('unavailable');
    expect(mockRead).not.toHaveBeenCalled();
  });

  it('does not read when permission is denied', async () => {
    mockCheckAvailability.mockResolvedValue('permission-denied');
    await useBaselineStore.getState().initialize();
    expect(mockRead).not.toHaveBeenCalled();
  });
});

describe('dedupe', () => {
  it('does not change lastUpdated when the newest sample is unchanged', async () => {
    const records = [record(5, 70)];
    await primeStore(records);
    const firstUpdate = useBaselineStore.getState().lastUpdated;

    // Same records again — the source has not written anything new.
    await useBaselineStore.getState().fetchBaseline();

    expect(mockRead).toHaveBeenCalledTimes(2);
    expect(useBaselineStore.getState().lastUpdated).toBe(firstUpdate);
  });

  it('updates when a newer sample arrives', async () => {
    await primeStore([record(10, 70)]);
    const firstUpdate = useBaselineStore.getState().lastUpdated;

    // Build the records before freezing the clock, then advance it — otherwise
    // both fetches can land in the same millisecond and lastUpdated is
    // unchanged for reasons that have nothing to do with the dedupe.
    const newer = [record(10, 70), record(1, 100)];
    const realNow = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(realNow + 60_000);

    mockRead.mockResolvedValue(newer);
    await useBaselineStore.getState().fetchBaseline();

    expect(useBaselineStore.getState().baselineHeartRate).toBe(85);
    expect(useBaselineStore.getState().lastUpdated).toBe(realNow + 60_000);
    expect(useBaselineStore.getState().lastUpdated).not.toBe(firstUpdate);

    (Date.now as jest.Mock).mockRestore();
  });
});

describe('refreshNow debounce', () => {
  it('drops a manual refresh inside the debounce window', async () => {
    await primeStore([record(5, 70)]);
    expect(mockRead).toHaveBeenCalledTimes(1);

    await useBaselineStore.getState().refreshNow();

    // The initialize() fetch was moments ago, so this one is dropped.
    expect(mockRead).toHaveBeenCalledTimes(1);
  });

  it('allows a manual refresh once the window has passed', async () => {
    await primeStore([record(5, 70)]);

    const realNow = Date.now();
    jest
      .spyOn(Date, 'now')
      .mockReturnValue(realNow + MIN_MANUAL_REFRESH_INTERVAL_MS + 1);

    await useBaselineStore.getState().refreshNow();
    expect(mockRead).toHaveBeenCalledTimes(2);

    (Date.now as jest.Mock).mockRestore();
  });
});

describe('rate limiting', () => {
  it('keeps the last value, marks stale, and does not blank the card', async () => {
    await primeStore([record(5, 70)]);
    const previous = useBaselineStore.getState().baselineHeartRate;
    const previousUpdate = useBaselineStore.getState().lastUpdated;

    mockRead.mockRejectedValue(new Error('Rate limited request quota exceeded'));
    await useBaselineStore.getState().fetchBaseline();

    const state = useBaselineStore.getState();
    expect(state.baselineHeartRate).toBe(previous);
    expect(state.lastUpdated).toBe(previousUpdate);
    expect(state.isStale).toBe(true);
    expect(state.isLoading).toBe(false);
  });

  it('skips subsequent fetches while backing off', async () => {
    await primeStore([record(5, 70)]);
    mockRead.mockRejectedValue(new Error('rate limit exceeded'));
    await useBaselineStore.getState().fetchBaseline();
    const callsAfterFailure = mockRead.mock.calls.length;

    await useBaselineStore.getState().fetchBaseline();
    expect(mockRead).toHaveBeenCalledTimes(callsAfterFailure);
  });

  it('surfaces a non-rate-limit error without marking stale', async () => {
    await primeStore([record(5, 70)]);
    mockRead.mockRejectedValue(new Error('something else broke'));
    await useBaselineStore.getState().fetchBaseline();

    const state = useBaselineStore.getState();
    expect(state.error).toBe('something else broke');
    expect(state.isStale).toBe(false);
  });
});

describe('polling lifecycle', () => {
  it('fetches on the configured interval', async () => {
    jest.useFakeTimers();
    mockCheckAvailability.mockResolvedValue('available');
    mockRead.mockResolvedValue([record(5, 70)]);
    useBaselineStore.setState({ status: 'available' });

    useBaselineStore.getState().startPolling();
    expect(mockRead).not.toHaveBeenCalled();

    jest.advanceTimersByTime(BASELINE_POLL_INTERVAL_MS);
    expect(mockRead).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(BASELINE_POLL_INTERVAL_MS);
    expect(mockRead).toHaveBeenCalledTimes(2);
  });

  it('stops firing after stopPolling', () => {
    jest.useFakeTimers();
    useBaselineStore.setState({ status: 'available' });
    mockRead.mockResolvedValue([record(5, 70)]);

    useBaselineStore.getState().startPolling();
    useBaselineStore.getState().stopPolling();
    jest.advanceTimersByTime(BASELINE_POLL_INTERVAL_MS * 3);

    expect(mockRead).not.toHaveBeenCalled();
  });

  it('does not leak an interval when startPolling is called twice', () => {
    jest.useFakeTimers();
    useBaselineStore.setState({ status: 'available' });
    mockRead.mockResolvedValue([record(5, 70)]);

    useBaselineStore.getState().startPolling();
    useBaselineStore.getState().startPolling();
    jest.advanceTimersByTime(BASELINE_POLL_INTERVAL_MS);

    // One interval, not two.
    expect(mockRead).toHaveBeenCalledTimes(1);
  });

  it('tolerates stopPolling when nothing is running', () => {
    expect(() => {
      useBaselineStore.getState().stopPolling();
      useBaselineStore.getState().stopPolling();
    }).not.toThrow();
  });
});
