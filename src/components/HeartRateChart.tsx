import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polygon, Polyline, Text as SvgText } from 'react-native-svg';
import { FONT_SIZE, RADIUS, SPACING } from '@/constants/theme';
import { useTheme } from '@/theme/ThemeProvider';
import {
  buildPolylinePoints,
  buildRangeBandPoints,
  computeDomain,
  computeTicks,
  createScale,
  downsample,
  type ChartGeometry,
} from '@/utils/chart';
import type { ChartPoint } from '@/types';

interface HeartRateChartProps {
  points: readonly ChartPoint[];
  /** 24h Health Connect baseline, drawn as a dashed reference. Null hides it. */
  baseline: number | null;
  height?: number;
  /** Available width in px. */
  width: number;
  /** Copy shown before any point has been recorded. */
  emptyLabel?: string;
}

/** Reserved for the y-axis labels and the last-point marker. */
const PADDING = { top: 12, right: 14, bottom: 8, left: 34 };

/** A phone chart is a few hundred px wide; more points than this is invisible detail. */
const MAX_RENDERED_POINTS = 120;

/**
 * Heart rate over the course of a session.
 *
 * One series, so there is no legend — the card title names it. The baseline is
 * a reference line rather than a second series, and is direct-labeled so its
 * identity never rests on colour alone.
 *
 * There is no touch tooltip. Hover does not exist on a phone, and a scrub
 * gesture on a live-updating chart is a separate piece of design work; the
 * live BPM card above already carries the current value, which is what a
 * tooltip would report.
 */
export function HeartRateChart({
  points,
  baseline,
  height = 180,
  width,
  emptyLabel = 'Waiting for the first interval…',
}: HeartRateChartProps): React.JSX.Element {
  const { colors } = useTheme();

  if (points.length === 0) {
    return (
      <View style={[styles.empty, { height, backgroundColor: colors.surfaceAlt }]}>
        <Text style={[styles.emptyText, { color: colors.textMuted }]}>{emptyLabel}</Text>
      </View>
    );
  }

  const rendered = downsample(points, MAX_RENDERED_POINTS);
  const geometry: ChartGeometry = { width, height, padding: PADDING };
  const domain = computeDomain(rendered, baseline);
  const scale = createScale(geometry, domain);

  const line = buildPolylinePoints(rendered, scale);
  const band = buildRangeBandPoints(rendered, scale);
  const ticks = computeTicks(domain, 3);

  const lastIndex = rendered.length - 1;
  const lastX = scale.x(lastIndex, rendered.length);
  const lastY = scale.y(rendered[lastIndex].value);

  const baselineY = baseline === null ? null : scale.y(baseline);

  return (
    <Svg width={width} height={height}>
      {/* Recessive gridlines — reference, not content. */}
      {ticks.map((tick) => (
        <Line
          key={`grid-${tick}`}
          x1={PADDING.left}
          y1={scale.y(tick)}
          x2={width - PADDING.right}
          y2={scale.y(tick)}
          stroke={colors.border}
          strokeWidth={1}
        />
      ))}

      {ticks.map((tick) => (
        <SvgText
          key={`label-${tick}`}
          x={PADDING.left - 6}
          y={scale.y(tick) + 4}
          fontSize={FONT_SIZE.xs}
          fill={colors.textMuted}
          textAnchor="end"
        >
          {String(tick)}
        </SvgText>
      ))}

      {/* Interval range, behind the mean line. */}
      {band !== null && <Polygon points={band} fill={colors.primary} fillOpacity={0.15} />}

      {/* Baseline reference: dashed and labeled, so it never reads as the series. */}
      {baselineY !== null && (
        <>
          <Line
            x1={PADDING.left}
            y1={baselineY}
            x2={width - PADDING.right}
            y2={baselineY}
            stroke={colors.baseline}
            strokeWidth={2}
            strokeDasharray="5 4"
          />
          <SvgText
            x={width - PADDING.right}
            y={baselineY - 5}
            fontSize={FONT_SIZE.xs}
            fill={colors.baseline}
            textAnchor="end"
          >
            baseline
          </SvgText>
        </>
      )}

      <Polyline
        points={line}
        fill="none"
        stroke={colors.primary}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* The current value, ringed in the surface colour so it stays legible
          where it crosses the band or the baseline. */}
      <Circle
        cx={lastX}
        cy={lastY}
        r={4.5}
        fill={colors.primary}
        stroke={colors.surface}
        strokeWidth={2}
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  empty: {
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.md,
  },
  emptyText: {
    fontSize: FONT_SIZE.sm,
  },
});
