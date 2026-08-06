import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { FONT_SIZE, RADIUS, SHADOW, SPACING } from '@/constants/theme';
import { useTheme } from '@/theme/ThemeProvider';
import { listSessionsWithData } from '@/db/queries';
import { formatDuration } from '@/utils/format';
import { TRACKING_INTERVALS } from '@/constants/tracking';
import type { Session } from '@/types';

export default function HistoryScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Reloaded on focus rather than once on mount: a session ended on the Live
  // tab must appear here without restarting the app.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void listSessionsWithData().then((rows) => {
        if (!cancelled) {
          setSessions(rows);
          setLoaded(true);
        }
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + SPACING.md },
      ]}
      data={sessions}
      keyExtractor={(item) => String(item.id)}
      ListHeaderComponent={
        <Text style={[styles.title, { color: colors.textPrimary }]}>History</Text>
      }
      ListEmptyComponent={
        loaded ? (
          <View style={[styles.empty, { backgroundColor: colors.surface }, SHADOW.sm]}>
            <Ionicons name="pulse-outline" size={28} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>
              No sessions yet
            </Text>
            <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
              Connect your monitor on the Live tab and press Start session to
              record one.
            </Text>
          </View>
        ) : null
      }
      renderItem={({ item }) => (
        <SessionRow session={item} onPress={() => router.push(`/sessions/${item.id}`)} />
      )}
    />
  );

  function SessionRow({
    session,
    onPress,
  }: {
    session: Session;
    onPress: () => void;
  }): React.JSX.Element {
    const started = new Date(session.startTime);
    const duration =
      session.endTime === null ? null : session.endTime - session.startTime;
    const intervalLabel =
      TRACKING_INTERVALS.find((o) => o.ms === session.intervalMs)?.label ?? null;

    return (
      <Pressable
        onPress={onPress}
        style={[styles.row, { backgroundColor: colors.surface }, SHADOW.sm]}
        accessibilityRole="button"
        testID={`session-row-${session.id}`}
      >
        <View style={styles.rowMain}>
          <Text style={[styles.rowDate, { color: colors.textPrimary }]}>
            {started.toLocaleDateString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}
          </Text>
          <Text style={[styles.rowTime, { color: colors.textMuted }]}>
            {started.toLocaleTimeString(undefined, {
              hour: 'numeric',
              minute: '2-digit',
            })}
            {duration !== null && ` · ${formatDuration(duration)}`}
            {intervalLabel !== null && ` · every ${intervalLabel}`}
          </Text>
        </View>

        <View style={styles.rowStats}>
          <Text style={[styles.rowAvg, { color: colors.primary }]}>
            {session.avgHr ?? '––'}
          </Text>
          <Text style={[styles.rowStatLabel, { color: colors.textMuted }]}>
            avg{session.maxHr !== null && ` · ${session.maxHr} max`}
          </Text>
        </View>

        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Pressable>
    );
  }
}

const styles = StyleSheet.create({
  content: {
    padding: SPACING.md,
    gap: SPACING.sm,
    paddingBottom: SPACING.xxl,
  },
  title: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '800',
    marginBottom: SPACING.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
  },
  rowMain: {
    flex: 1,
    gap: 2,
  },
  rowDate: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
  },
  rowTime: {
    fontSize: FONT_SIZE.xs,
  },
  rowStats: {
    alignItems: 'flex-end',
  },
  rowAvg: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '800',
  },
  rowStatLabel: {
    fontSize: FONT_SIZE.xs,
  },
  empty: {
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    gap: SPACING.sm,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
  },
  emptyBody: {
    fontSize: FONT_SIZE.sm,
    textAlign: 'center',
    lineHeight: FONT_SIZE.sm * 1.4,
  },
});
