// Pure geometry for the heart rate chart. No React, no SVG, no native imports —
// all of it runs in the `unit` Jest project.
//
// Keeping the scaling out of the component is what makes the chart testable at
// all: an off-by-one in the y-domain or an inverted axis is invisible in a
// snapshot but obvious in an assertion about coordinates.

import type { ChartPoint } from '@/types';

export interface ChartGeometry {
  width: number;
  height: number;
  /** Inner padding reserved for axis labels. */
  padding: { top: number; right: number; bottom: number; left: number };
}

export interface Scale {
  /** Lowest BPM the y-axis shows. */
  min: number;
  /** Highest BPM the y-axis shows. */
  max: number;
  /** Map a BPM to a y pixel coordinate (inverted: higher BPM = smaller y). */
  y: (bpm: number) => number;
  /** Map a series index to an x pixel coordinate. */
  x: (index: number, total: number) => number;
}

/** Minimum BPM span, so a flat line doesn't render as a full-height zigzag. */
const MIN_DOMAIN_SPAN = 20;

/** Padding added above and below the data, as a fraction of its span. */
const DOMAIN_PADDING_RATIO = 0.1;

/**
 * Build the y-domain from the data, the range band, and an optional baseline.
 *
 * The baseline is included in the domain because a reference line drawn outside
 * the visible range is worse than no reference line — it silently clips and the
 * viewer reads the chart as if the baseline were off the top.
 *
 * The domain is never anchored to zero: resting-to-max heart rate occupies a
 * narrow band far from it, and a zero-based axis would flatten every session
 * into an indistinguishable line across the top.
 */
export function computeDomain(
  points: readonly ChartPoint[],
  baseline: number | null = null,
): { min: number; max: number } {
  const values: number[] = [];
  for (const p of points) {
    values.push(p.value);
    if (p.min !== null) values.push(p.min);
    if (p.max !== null) values.push(p.max);
  }
  if (baseline !== null) values.push(baseline);

  if (values.length === 0) return { min: 60, max: 100 };

  let lo = Math.min(...values);
  let hi = Math.max(...values);

  const span = hi - lo;
  if (span < MIN_DOMAIN_SPAN) {
    const grow = (MIN_DOMAIN_SPAN - span) / 2;
    lo -= grow;
    hi += grow;
  } else {
    const pad = span * DOMAIN_PADDING_RATIO;
    lo -= pad;
    hi += pad;
  }

  return { min: Math.max(0, Math.floor(lo)), max: Math.ceil(hi) };
}

/** Build pixel scales for a geometry and domain. */
export function createScale(
  geometry: ChartGeometry,
  domain: { min: number; max: number },
): Scale {
  const { width, height, padding } = geometry;
  const plotWidth = Math.max(1, width - padding.left - padding.right);
  const plotHeight = Math.max(1, height - padding.top - padding.bottom);
  const span = Math.max(1, domain.max - domain.min);

  return {
    min: domain.min,
    max: domain.max,
    y: (bpm) => {
      const clamped = Math.min(domain.max, Math.max(domain.min, bpm));
      const ratio = (clamped - domain.min) / span;
      // Inverted: SVG y grows downward, BPM grows upward.
      return padding.top + (1 - ratio) * plotHeight;
    },
    x: (index, total) => {
      if (total <= 1) return padding.left + plotWidth / 2;
      return padding.left + (index / (total - 1)) * plotWidth;
    },
  };
}

/** `x,y` pairs for an SVG `points` attribute. */
export function buildPolylinePoints(
  points: readonly ChartPoint[],
  scale: Scale,
): string {
  return points
    .map((p, i) => `${scale.x(i, points.length).toFixed(2)},${scale.y(p.value).toFixed(2)}`)
    .join(' ');
}

/**
 * A closed polygon tracing the interval maxima left-to-right and the minima
 * back, for the range band behind the mean line.
 *
 * Returns null when no point carries a range — every reading was a lone sample,
 * so there is no spread to show and an empty band would be a misleading
 * zero-width shape.
 */
export function buildRangeBandPoints(
  points: readonly ChartPoint[],
  scale: Scale,
): string | null {
  const withRange = points.filter((p) => p.min !== null && p.max !== null);
  if (withRange.length === 0) return null;
  if (!points.some((p) => (p.max ?? 0) > (p.min ?? 0))) return null;

  const total = points.length;
  const top: string[] = [];
  const bottom: string[] = [];

  points.forEach((p, i) => {
    const x = scale.x(i, total).toFixed(2);
    top.push(`${x},${scale.y(p.max ?? p.value).toFixed(2)}`);
    bottom.unshift(`${x},${scale.y(p.min ?? p.value).toFixed(2)}`);
  });

  return [...top, ...bottom].join(' ');
}

/**
 * Evenly spaced y-axis tick values across the domain.
 *
 * Deliberately few — the axis is a reference, not the content, and a dense
 * ladder of BPM labels competes with the line for attention.
 */
export function computeTicks(
  domain: { min: number; max: number },
  count = 3,
): number[] {
  if (count < 2) return [domain.min, domain.max];
  const step = (domain.max - domain.min) / (count - 1);
  return Array.from({ length: count }, (_, i) => Math.round(domain.min + step * i));
}

/**
 * Nearest point index for a touch x — the inverse of `scale.x`.
 *
 * Snapping to the nearest point rather than requiring a hit on the marker
 * itself is what makes the chart usable with a finger: a fingertip is roughly
 * 44px across against a 4.5px marker, so the touch only has to be *closest*,
 * never dead-centre. Touches outside the plot area clamp to the end points
 * instead of returning nothing, so dragging off the edge holds the last
 * reading rather than flickering the readout away.
 */
export function indexAtX(x: number, geometry: ChartGeometry, count: number): number {
  if (count <= 0) return -1;
  if (count === 1) return 0;

  const { width, padding } = geometry;
  const plotWidth = Math.max(1, width - padding.left - padding.right);
  const ratio = (x - padding.left) / plotWidth;
  const index = Math.round(ratio * (count - 1));

  return Math.min(count - 1, Math.max(0, index));
}

/**
 * Keep the readout inside the chart's horizontal bounds.
 *
 * Without this the readout is cut off at exactly the two points a reader is
 * most likely to inspect — the start and the end of a session.
 */
export function clampReadoutX(
  centerX: number,
  readoutWidth: number,
  chartWidth: number,
): number {
  const half = readoutWidth / 2;
  if (readoutWidth >= chartWidth) return 0;
  return Math.min(chartWidth - readoutWidth, Math.max(0, centerX - half));
}

/**
 * Reduce a series to at most `maxPoints` by even stride, always keeping the
 * first and last so the visible time span never shrinks.
 *
 * A phone chart is a few hundred pixels wide; drawing 720 points into it costs
 * work and renders sub-pixel detail nobody can see.
 */
export function downsample(
  points: readonly ChartPoint[],
  maxPoints: number,
): readonly ChartPoint[] {
  if (maxPoints < 2 || points.length <= maxPoints) return points;

  const stride = (points.length - 1) / (maxPoints - 1);
  const out: ChartPoint[] = [];
  for (let i = 0; i < maxPoints; i++) {
    out.push(points[Math.round(i * stride)]);
  }
  return out;
}
