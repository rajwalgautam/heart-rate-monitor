import {
  calculateBaseline,
  flattenSamples,
  newestSampleTime,
  withinWindow,
} from '@/healthconnect/utils';
import type { HeartRateRecordLike } from '@/types';

const NOW = Date.parse('2026-08-02T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;

/** Build a record whose samples are `hoursAgo` before NOW. */
function record(...samples: Array<[hoursAgo: number, bpm: number]>): HeartRateRecordLike {
  return {
    samples: samples.map(([hoursAgo, bpm]) => ({
      time: new Date(NOW - hoursAgo * HOUR).toISOString(),
      beatsPerMinute: bpm,
    })),
  };
}

describe('flattenSamples', () => {
  it('flattens nested samples across multiple records', () => {
    const records = [record([1, 60], [2, 70]), record([3, 80])];
    expect(flattenSamples(records)).toHaveLength(3);
  });

  it('returns an empty array for no records', () => {
    expect(flattenSamples([])).toEqual([]);
  });

  it('returns an empty array for records with empty sample arrays', () => {
    expect(flattenSamples([{ samples: [] }])).toEqual([]);
  });

  it('drops samples with an unparseable timestamp', () => {
    const records: HeartRateRecordLike[] = [
      { samples: [{ time: 'not-a-date', beatsPerMinute: 60 }] },
    ];
    expect(flattenSamples(records)).toEqual([]);
  });

  it('drops samples with a non-finite BPM', () => {
    const records: HeartRateRecordLike[] = [
      { samples: [{ time: new Date(NOW).toISOString(), beatsPerMinute: NaN }] },
    ];
    expect(flattenSamples(records)).toEqual([]);
  });

  it('converts ISO timestamps to epoch milliseconds', () => {
    expect(flattenSamples([record([1, 60])])[0].time).toBe(NOW - HOUR);
  });
});

describe('withinWindow', () => {
  it('keeps samples inside the window and drops older ones', () => {
    const samples = flattenSamples([record([1, 60], [30, 70])]);
    expect(withinWindow(samples, NOW)).toHaveLength(1);
  });

  it('includes a sample exactly on the cutoff boundary', () => {
    const samples = flattenSamples([record([24, 60])]);
    expect(withinWindow(samples, NOW)).toHaveLength(1);
  });

  it('excludes a sample just outside the cutoff', () => {
    const samples = [{ time: NOW - 24 * HOUR - 1, beatsPerMinute: 60 }];
    expect(withinWindow(samples, NOW)).toHaveLength(0);
  });

  it('excludes future-dated samples', () => {
    const samples = [{ time: NOW + HOUR, beatsPerMinute: 60 }];
    expect(withinWindow(samples, NOW)).toHaveLength(0);
  });
});

describe('calculateBaseline', () => {
  it('averages per sample, not per record', () => {
    // Record A holds three samples at 60; record B holds one at 100.
    // Per-sample mean is (60*3 + 100) / 4 = 70.
    // A per-record mean would be (60 + 100) / 2 = 80 — the bug this guards.
    const records = [record([1, 60], [2, 60], [3, 60]), record([4, 100])];
    expect(calculateBaseline(records, NOW)).toBe(70);
  });

  it('rounds to a whole BPM', () => {
    // (60 + 61) / 2 = 60.5 -> 61
    expect(calculateBaseline([record([1, 60], [2, 61])], NOW)).toBe(61);
  });

  it('returns null for no records', () => {
    expect(calculateBaseline([], NOW)).toBeNull();
  });

  it('returns null — not NaN or 0 — when every sample is outside the window', () => {
    const result = calculateBaseline([record([48, 60])], NOW);
    expect(result).toBeNull();
    expect(Number.isNaN(result as unknown as number)).toBe(false);
  });

  it('honours a custom window', () => {
    const records = [record([1, 60], [5, 100])];
    // A 2-hour window sees only the 60.
    expect(calculateBaseline(records, NOW, 2 * HOUR)).toBe(60);
  });
});

describe('newestSampleTime', () => {
  it('returns the maximum timestamp across records', () => {
    const records = [record([5, 60]), record([1, 70], [3, 80])];
    expect(newestSampleTime(records)).toBe(NOW - HOUR);
  });

  it('returns null when there are no samples', () => {
    expect(newestSampleTime([])).toBeNull();
    expect(newestSampleTime([{ samples: [] }])).toBeNull();
  });

  it('is stable across repeated identical reads (dedupe contract)', () => {
    const records = [record([1, 60])];
    expect(newestSampleTime(records)).toBe(newestSampleTime(records));
  });
});
