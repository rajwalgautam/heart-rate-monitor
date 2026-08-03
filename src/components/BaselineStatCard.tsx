import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONT_SIZE, RADIUS, SHADOW, SPACING } from '@/constants/theme';
import { useTheme } from '@/theme/ThemeProvider';
import { formatRelativeTime } from '@/utils/format';
import type { HealthConnectStatus } from '@/types';

interface BaselineStatCardProps {
  baseline: number | null;
  lastUpdated: number | null;
  isLoading: boolean;
  isStale: boolean;
  status: HealthConnectStatus;
  onRefresh: () => void;
  onRequestAccess: () => void;
}

/**
 * The 24h baseline, with a manual refresh and an explicit staleness marker.
 *
 * Health Connect being unavailable is an expected state, not an error: the card
 * explains itself and the rest of the dashboard keeps working as a live-only
 * monitor. See implementation.md D4.
 */
export function BaselineStatCard({
  baseline,
  lastUpdated,
  isLoading,
  isStale,
  status,
  onRefresh,
  onRequestAccess,
}: BaselineStatCardProps): React.JSX.Element {
  const { colors } = useTheme();

  if (status === 'unavailable') {
    return (
      <Shell testID="baseline-card">
        <Header />
        <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>
          Health Connect unavailable
        </Text>
        <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
          Install or enable Health Connect to see your 24-hour baseline. Live
          monitoring works without it.
        </Text>
      </Shell>
    );
  }

  if (status === 'permission-denied') {
    return (
      <Shell testID="baseline-card">
        <Header />
        <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>
          Permission needed
        </Text>
        <Pressable
          onPress={onRequestAccess}
          style={[styles.grantButton, { backgroundColor: colors.primaryMuted }]}
          accessibilityRole="button"
        >
          <Text style={[styles.grantLabel, { color: colors.primary }]}>
            Grant heart rate access
          </Text>
        </Pressable>
      </Shell>
    );
  }

  return (
    <Shell testID="baseline-card">
      <Header />
      <View style={styles.readout}>
        <Text
          style={[
            styles.value,
            { color: baseline === null ? colors.textMuted : colors.baseline },
          ]}
          testID="baseline-bpm"
        >
          {baseline === null ? '––' : String(baseline)}
        </Text>
        <Text style={[styles.unit, { color: colors.textSecondary }]}>BPM</Text>
      </View>

      <View style={styles.footer}>
        <Text
          style={[styles.timestamp, { color: isStale ? colors.warning : colors.textMuted }]}
          testID="baseline-timestamp"
        >
          {isStale ? `Stale · ${formatRelativeTime(lastUpdated)}` : formatRelativeTime(lastUpdated)}
        </Text>
        <Pressable
          onPress={onRefresh}
          disabled={isLoading}
          accessibilityRole="button"
          accessibilityLabel="Refresh baseline"
          testID="baseline-refresh"
          hitSlop={8}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color={colors.baseline} />
          ) : (
            <Ionicons name="refresh" size={18} color={colors.textSecondary} />
          )}
        </Pressable>
      </View>
    </Shell>
  );

  function Shell({
    children,
    testID,
  }: {
    children: React.ReactNode;
    testID: string;
  }): React.JSX.Element {
    return (
      <View
        style={[styles.card, { backgroundColor: colors.surface }, SHADOW.sm]}
        testID={testID}
      >
        {children}
      </View>
    );
  }

  function Header(): React.JSX.Element {
    return (
      <View style={styles.header}>
        <Ionicons name="analytics" size={16} color={colors.baseline} />
        <Text style={[styles.label, { color: colors.textMuted }]}>24h baseline</Text>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  label: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  readout: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: SPACING.xs,
  },
  value: {
    fontSize: FONT_SIZE.xxxl,
    fontWeight: '800',
  },
  unit: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    paddingBottom: SPACING.xs,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timestamp: {
    fontSize: FONT_SIZE.xs,
  },
  emptyTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
  },
  emptyBody: {
    fontSize: FONT_SIZE.sm,
    lineHeight: FONT_SIZE.sm * 1.4,
  },
  grantButton: {
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    alignSelf: 'flex-start',
  },
  grantLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
  },
});
