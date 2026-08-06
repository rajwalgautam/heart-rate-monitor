import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FONT_SIZE, RADIUS, SHADOW, SPACING } from '@/constants/theme';
import { useTheme } from '@/theme/ThemeProvider';
import { deleteSession, getSession, getSessionReadings } from '@/db/queries';
import { HeartRateChart } from '@/components/HeartRateChart';
import { formatDuration } from '@/utils/format';
import { TRACKING_INTERVALS } from '@/constants/tracking';
import type { ChartPoint, Session } from '@/types';

export default function SessionDetailScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const sessionId = Number(id);

  const [session, setSession] = useState<Session | null>(null);
  const [points, setPoints] = useState<ChartPoint[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [chartWidth, setChartWidth] = useState(0);

  const onChartLayout = useCallback((e: LayoutChangeEvent) => {
    setChartWidth(e.nativeEvent.layout.width);
  }, []);

  useEffect(() => {
    if (!Number.isFinite(sessionId)) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      const [row, readings] = await Promise.all([
        getSession(sessionId),
        getSessionReadings(sessionId),
      ]);
      if (cancelled) return;
      setSession(row);
      setPoints(
        readings.map((r) => ({
          timestamp: r.timestamp,
          value: r.hrValue,
          min: r.hrMin,
          max: r.hrMax,
        })),
      );
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (!loaded) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (session === null) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.textSecondary }}>Session not found.</Text>
      </View>
    );
  }

  const started = new Date(session.startTime);
  const duration = session.endTime === null ? null : session.endTime - session.startTime;
  const intervalLabel =
    TRACKING_INTERVALS.find((o) => o.ms === session.intervalMs)?.label ?? null;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.date, { color: colors.textPrimary }]}>
        {started.toLocaleDateString(undefined, {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        })}
      </Text>
      <Text style={[styles.time, { color: colors.textMuted }]}>
        {started.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
        {intervalLabel !== null && ` · recorded every ${intervalLabel}`}
      </Text>

      <View style={styles.stats}>
        <Stat label="Duration" value={duration === null ? '––' : formatDuration(duration)} />
        <Stat label="Avg" value={session.avgHr === null ? '––' : String(session.avgHr)} />
        <Stat label="Max" value={session.maxHr === null ? '––' : String(session.maxHr)} />
      </View>

      <View
        style={[styles.chartCard, { backgroundColor: colors.surface }, SHADOW.sm]}
        onLayout={onChartLayout}
      >
        <Text style={[styles.chartTitle, { color: colors.textMuted }]}>
          Session heart rate
        </Text>
        {chartWidth > 0 && (
          <HeartRateChart
            points={points}
            // No baseline on a historical chart: the 24h baseline is a live
            // rolling value, and drawing today's against a past session would
            // invite a comparison that isn't valid.
            baseline={null}
            width={chartWidth - SPACING.md * 2}
            height={200}
            emptyLabel="No points were recorded for this session."
          />
        )}
      </View>

      <Pressable
        onPress={() => {
          Alert.alert('Delete session?', 'This cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () => {
                void deleteSession(session.id).then(() => router.back());
              },
            },
          ]);
        }}
        style={[styles.delete, { backgroundColor: colors.surfaceAlt }]}
        accessibilityRole="button"
      >
        <Text style={[styles.deleteLabel, { color: colors.danger }]}>Delete session</Text>
      </Pressable>
    </ScrollView>
  );

  function Stat({ label, value }: { label: string; value: string }): React.JSX.Element {
    return (
      <View style={[styles.stat, { backgroundColor: colors.surface }, SHADOW.sm]}>
        <Text style={[styles.statLabel, { color: colors.textMuted }]}>{label}</Text>
        <Text style={[styles.statValue, { color: colors.textPrimary }]}>{value}</Text>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: {
    padding: SPACING.md,
    gap: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  date: { fontSize: FONT_SIZE.xl, fontWeight: '800' },
  time: { fontSize: FONT_SIZE.sm, marginTop: -SPACING.sm },
  stats: { flexDirection: 'row', gap: SPACING.sm },
  stat: {
    flex: 1,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    gap: SPACING.xs,
  },
  statLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statValue: { fontSize: FONT_SIZE.xl, fontWeight: '800' },
  chartCard: {
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  chartTitle: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  delete: {
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
  },
  deleteLabel: { fontSize: FONT_SIZE.md, fontWeight: '700' },
});
