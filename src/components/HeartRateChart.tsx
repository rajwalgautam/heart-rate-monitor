import { useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polygon, Polyline, Text as SvgText } from 'react-native-svg';
import { FONT_SIZE, RADIUS, SPACING } from '@/constants/theme';
import { useTheme } from '@/theme/ThemeProvider';
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
  /** Touch-and-drag readout. On by default. */
  interactive?: boolean;
}

/** Reserved for the y-axis labels and the last-point marker. */
const PADDING = { top: 12, right: 14, bottom: 8, left: 34 };

/** A phone chart is a few hundred px wide; more points than this is invisible detail. */
const MAX_RENDERED_POINTS = 120;

/** Width reserved for the scrub readout, used to keep it inside the chart. */
const READOUT_WIDTH = 96;

/**
 * Heart rate over the course of a session.
 *
 * One series, so there is no legend — the card title names it. The baseline is
 * a reference line rather than a second series, and is direct-labeled so its
 * identity never rests on colour alone.
 *
 * Touch and drag reads out the nearest point. Snapping to nearest is what makes
 * it usable with a finger — a fingertip is ~44px across against a 4.5px marker,
 * so the touch only has to be closest, never dead-centre.
 */
export function HeartRateChart({
  points,
  baseline,
  height = 180,
  width,
  emptyLabel = 'Waiting for the first interval…',
  interactive = true,
}: HeartRateChartProps): React.JSX.Element {
  const { colors } = useTheme();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const rendered = useMemo(() => downsample(points, MAX_RENDERED_POINTS), [points]);
  const geometry: ChartGeometry = { width, height, padding: PADDING };

  // Held in a ref so the responder callbacks — created once — always read the
  // current series rather than the one captured at mount. The live chart's
  // series changes on every interval tick.
  const scrubState = useRef({ geometry, count: rendered.length });
  scrubState.current = { geometry, count: rendered.length };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        // Let a vertical drag scroll the page rather than be swallowed by the
        // chart. The parent ScrollView asks for the responder when it starts
        // scrolling, and granting it is what keeps the screen usable.
        onPanResponderTerminationRequest: () => true,
        onPanResponderGrant: (e) => {
          const { geometry: g, count } = scrubState.current;
          setActiveIndex(indexAtX(e.nativeEvent.locationX, g, count));
        },
        onPanResponderMove: (e) => {
          const { geometry: g, count } = scrubState.current;
          setActiveIndex(indexAtX(e.nativeEvent.locationX, g, count));
        },
        onPanResponderRelease: () => setActiveIndex(null),
        // Also cleared here: without it a readout strands on screen every time
        // the scroll view steals the gesture.
        onPanResponderTerminate: () => setActiveIndex(null),
      }),
    [],
  );

  if (points.length === 0) {
    return (
      <View style={[styles.empty, { height, backgroundColor: colors.surfaceAlt }]}>
        <Text style={[styles.emptyText, { color: colors.textMuted }]}>{emptyLabel}</Text>
      </View>
    );
  }

  const domain = computeDomain(rendered, baseline);
  const scale = createScale(geometry, domain);

  const line = buildPolylinePoints(rendered, scale);
  const band = buildRangeBandPoints(rendered, scale);
  const ticks = computeTicks(domain, 3);

  const lastIndex = rendered.length - 1;
  const lastX = scale.x(lastIndex, rendered.length);
  const lastY = scale.y(rendered[lastIndex].value);

  const baselineY = baseline === null ? null : scale.y(baseline);

  // The series can shrink between a touch and this render (a downsample
  // boundary on the live chart), so the index is re-validated rather than
  // trusted — a stale index would dereference undefined.
  const active =
    activeIndex !== null && activeIndex >= 0 && activeIndex < rendered.length
      ? { index: activeIndex, point: rendered[activeIndex] }
      : null;

  const activeX = active === null ? 0 : scale.x(active.index, rendered.length);
  const activeY = active === null ? 0 : scale.y(active.point.value);

  return (
    <View {...(interactive ? panResponder.panHandlers : {})}>
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
        {band !== null && (
          <Polygon points={band} fill={colors.primary} fillOpacity={0.15} />
        )}

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

        {/* Crosshair finds the X: the reader aims at a moment in time, never at
            a 2px line. */}
        {active !== null && (
          <>
            <Line
              x1={activeX}
              y1={PADDING.top}
              x2={activeX}
              y2={height - PADDING.bottom}
              stroke={colors.textMuted}
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <Circle
              cx={activeX}
              cy={activeY}
              r={6}
              fill={colors.primary}
              stroke={colors.surface}
              strokeWidth={2}
            />
          </>
        )}
      </Svg>

      {active !== null && (
        <View
          pointerEvents="none"
          style={[
            styles.readout,
            {
              backgroundColor: colors.surfaceAlt,
              borderColor: colors.border,
              left: clampReadoutX(activeX, READOUT_WIDTH, width),
              width: READOUT_WIDTH,
            },
          ]}
          testID="chart-readout"
        >
          {/* Value leads, label follows — the reader has the series and wants
              the number. */}
          <Text style={[styles.readoutValue, { color: colors.textPrimary }]}>
            {active.point.value}
            <Text style={[styles.readoutUnit, { color: colors.textSecondary }]}>
              {' '}
              BPM
            </Text>
          </Text>
          <Text style={[styles.readoutTime, { color: colors.textMuted }]}>
            {new Date(active.point.timestamp).toLocaleTimeString(undefined, {
              hour: 'numeric',
              minute: '2-digit',
              second: '2-digit',
            })}
          </Text>
        </View>
      )}
    </View>
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
  readout: {
    position: 'absolute',
    top: 0,
    borderRadius: RADIUS.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    alignItems: 'center',
  },
  readoutValue: {
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
  },
  readoutUnit: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
  },
  readoutTime: {
    fontSize: FONT_SIZE.xs,
    fontVariant: ['tabular-nums'],
  },
});
