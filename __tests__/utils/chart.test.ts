import {
  buildPolylinePoints,
  buildRangeBandPoints,
  clampReadoutX,
  computeDomain,
  computeTicks,
  createScale,
  downsample,
  indexAtX,
  type ChartGeometry,
} from '@/utils/chart';
import { summarizeInterval, capSeries } from '@/utils/tracking';
import type { ChartPoint } from '@/types';

const GEOMETRY: ChartGeometry = {
  width: 320,
  height: 160,
  padding: { top: 10, right: 10, bottom: 20, left: 30 },
};

function point(value: number, min: number | null = null, max: number | null = null): ChartPoint {
  return { timestamp: 0, value, min, max };
}

describe('summarizeInterval', () => {
  it('records the mean of the interval', () => {
    expect(summarizeInterval([70, 72, 74, 76])).toEqual({ mean: 73, min: 70, max: 76 });
  });

  it('keeps the spread the mean hides', () => {
    // A steady 118 and a swing between 90 and 150 both average ~118; only the
    // range distinguishes them.
    expect(summarizeInterval([90, 150, 114])).toEqual({ mean: 118, min: 90, max: 150 });
    expect(summarizeInterval([118, 118, 118])).toEqual({ mean: 118, min: 118, max: 118 });
  });

  it('returns null for an empty interval rather than a zeroed point', () => {
    expect(summarizeInterval([])).toBeNull();
  });

  it('rounds the mean to a whole BPM', () => {
    expect(summarizeInterval([70, 71])?.mean).toBe(71);
  });

  it('handles a single reading', () => {
    expect(summarizeInterval([88])).toEqual({ mean: 88, min: 88, max: 88 });
  });
});

describe('capSeries', () => {
  it('keeps the most recent entries', () => {
    expect(capSeries([1, 2, 3, 4, 5], 3)).toEqual([3, 4, 5]);
  });

  it('returns the same reference when under the cap', () => {
    const series = [1, 2, 3];
    expect(capSeries(series, 5)).toBe(series);
  });

  it('returns the same reference exactly at the cap', () => {
    const series = [1, 2, 3];
    expect(capSeries(series, 3)).toBe(series);
  });
});

describe('computeDomain', () => {
  it('never anchors to zero', () => {
    const domain = computeDomain([point(120), point(140)]);
    expect(domain.min).toBeGreaterThan(0);
  });

  it('widens a flat series to a minimum span', () => {
    const domain = computeDomain([point(70), point(70), point(70)]);
    expect(domain.max - domain.min).toBeGreaterThanOrEqual(20);
  });

  it('includes the range band in the domain', () => {
    const domain = computeDomain([point(100, 60, 180)]);
    expect(domain.min).toBeLessThanOrEqual(60);
    expect(domain.max).toBeGreaterThanOrEqual(180);
  });

  it('includes the baseline so the reference line cannot clip', () => {
    const domain = computeDomain([point(150), point(160)], 55);
    expect(domain.min).toBeLessThanOrEqual(55);
  });

  it('includes a baseline above the data too', () => {
    const domain = computeDomain([point(60), point(62)], 190);
    expect(domain.max).toBeGreaterThanOrEqual(190);
  });

  it('falls back to a sane domain with no data', () => {
    expect(computeDomain([])).toEqual({ min: 60, max: 100 });
  });

  it('never returns a negative floor', () => {
    expect(computeDomain([point(3)]).min).toBeGreaterThanOrEqual(0);
  });
});

describe('createScale', () => {
  const scale = createScale(GEOMETRY, { min: 60, max: 180 });

  it('inverts the y axis — higher BPM is nearer the top', () => {
    expect(scale.y(180)).toBeLessThan(scale.y(60));
  });

  it('puts the domain bounds on the plot edges', () => {
    expect(scale.y(180)).toBeCloseTo(GEOMETRY.padding.top, 5);
    expect(scale.y(60)).toBeCloseTo(GEOMETRY.height - GEOMETRY.padding.bottom, 5);
  });

  it('clamps values outside the domain into the plot area', () => {
    expect(scale.y(400)).toBeCloseTo(GEOMETRY.padding.top, 5);
    expect(scale.y(0)).toBeCloseTo(GEOMETRY.height - GEOMETRY.padding.bottom, 5);
  });

  it('spreads x across the plot width', () => {
    expect(scale.x(0, 5)).toBeCloseTo(GEOMETRY.padding.left, 5);
    expect(scale.x(4, 5)).toBeCloseTo(GEOMETRY.width - GEOMETRY.padding.right, 5);
  });

  it('centres a lone point instead of pinning it to the left edge', () => {
    const x = scale.x(0, 1);
    expect(x).toBeGreaterThan(GEOMETRY.padding.left);
    expect(x).toBeLessThan(GEOMETRY.width - GEOMETRY.padding.right);
  });

  it('tolerates a zero-span domain without dividing by zero', () => {
    const flat = createScale(GEOMETRY, { min: 70, max: 70 });
    expect(Number.isFinite(flat.y(70))).toBe(true);
  });
});

describe('buildPolylinePoints', () => {
  it('emits one x,y pair per point', () => {
    const scale = createScale(GEOMETRY, { min: 60, max: 180 });
    const out = buildPolylinePoints([point(80), point(120), point(160)], scale);
    expect(out.split(' ')).toHaveLength(3);
    expect(out).toMatch(/^[\d.]+,[\d.]+ [\d.]+,[\d.]+ [\d.]+,[\d.]+$/);
  });

  it('returns an empty string for no points', () => {
    const scale = createScale(GEOMETRY, { min: 60, max: 180 });
    expect(buildPolylinePoints([], scale)).toBe('');
  });
});

describe('buildRangeBandPoints', () => {
  const scale = createScale(GEOMETRY, { min: 60, max: 180 });

  it('traces maxima forward and minima back', () => {
    const out = buildRangeBandPoints([point(100, 90, 110), point(120, 110, 130)], scale);
    // Two points -> four vertices in the closed polygon.
    expect(out?.split(' ')).toHaveLength(4);
  });

  it('returns null when no point carries a range', () => {
    expect(buildRangeBandPoints([point(100), point(120)], scale)).toBeNull();
  });

  it('returns null when the range is zero-width everywhere', () => {
    // Every interval held one reading — a band would be a misleading flat shape.
    const out = buildRangeBandPoints([point(100, 100, 100), point(110, 110, 110)], scale);
    expect(out).toBeNull();
  });
});

describe('computeTicks', () => {
  it('spans the domain inclusively', () => {
    const ticks = computeTicks({ min: 60, max: 180 }, 3);
    expect(ticks).toEqual([60, 120, 180]);
  });

  it('defaults to a small number of ticks', () => {
    expect(computeTicks({ min: 0, max: 100 })).toHaveLength(3);
  });

  it('degrades to the bounds when asked for fewer than two', () => {
    expect(computeTicks({ min: 60, max: 180 }, 1)).toEqual([60, 180]);
  });
});

describe('indexAtX', () => {
  const scale = createScale(GEOMETRY, { min: 60, max: 180 });

  it('is the inverse of scale.x', () => {
    // Round-trips every index through pixel space and back.
    for (let i = 0; i < 5; i++) {
      expect(indexAtX(scale.x(i, 5), GEOMETRY, 5)).toBe(i);
    }
  });

  it('snaps to the nearest point, not the one to the left', () => {
    const mid = (scale.x(1, 5) + scale.x(2, 5)) / 2;
    // Just past halfway belongs to the second point.
    expect(indexAtX(mid + 1, GEOMETRY, 5)).toBe(2);
    expect(indexAtX(mid - 1, GEOMETRY, 5)).toBe(1);
  });

  it('clamps a touch left of the plot area to the first point', () => {
    expect(indexAtX(0, GEOMETRY, 5)).toBe(0);
    expect(indexAtX(-200, GEOMETRY, 5)).toBe(0);
  });

  it('clamps a touch right of the plot area to the last point', () => {
    expect(indexAtX(GEOMETRY.width, GEOMETRY, 5)).toBe(4);
    expect(indexAtX(9999, GEOMETRY, 5)).toBe(4);
  });

  it('returns the only index for a single-point series', () => {
    expect(indexAtX(0, GEOMETRY, 1)).toBe(0);
    expect(indexAtX(GEOMETRY.width, GEOMETRY, 1)).toBe(0);
  });

  it('returns -1 for an empty series', () => {
    expect(indexAtX(100, GEOMETRY, 0)).toBe(-1);
  });
});

describe('clampReadoutX', () => {
  it('centres the readout on the point when there is room', () => {
    expect(clampReadoutX(160, 80, 320)).toBe(120);
  });

  it('does not overflow the left edge at the first point', () => {
    expect(clampReadoutX(4, 80, 320)).toBe(0);
  });

  it('does not overflow the right edge at the last point', () => {
    expect(clampReadoutX(318, 80, 320)).toBe(240);
  });

  it('degrades to the left edge when the readout is wider than the chart', () => {
    expect(clampReadoutX(50, 400, 320)).toBe(0);
  });
});

describe('downsample', () => {
  const many: ChartPoint[] = Array.from({ length: 500 }, (_, i) => point(60 + (i % 40)));

  it('reduces to the requested count', () => {
    expect(downsample(many, 50)).toHaveLength(50);
  });

  it('keeps the first and last so the time span does not shrink', () => {
    const out = downsample(many, 50);
    expect(out[0]).toBe(many[0]);
    expect(out[out.length - 1]).toBe(many[many.length - 1]);
  });

  it('returns the input untouched when already small enough', () => {
    const few = [point(70), point(72)];
    expect(downsample(few, 50)).toBe(few);
  });
});
