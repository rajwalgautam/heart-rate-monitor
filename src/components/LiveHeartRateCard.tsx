import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONT_SIZE, RADIUS, SHADOW, SPACING } from '@/constants/theme';
import { useTheme } from '@/theme/ThemeProvider';
import { formatBaselineDelta } from '@/utils/format';

interface LiveHeartRateCardProps {
  /** Current BPM from the BLE stream, or null when nothing is streaming. */
  bpm: number | null;
  /** 24h baseline, used for the comparison line. Null hides it. */
  baseline: number | null;
  /** True while a device is connected; drives the placeholder copy. */
  isConnected: boolean;
}

/** The headline readout: live BPM contrasted against the 24h baseline. */
export function LiveHeartRateCard({
  bpm,
  baseline,
  isConnected,
}: LiveHeartRateCardProps): React.JSX.Element {
  const { colors } = useTheme();
  const delta = formatBaselineDelta(bpm, baseline);

  return (
    <View
      style={[styles.card, { backgroundColor: colors.surface }, SHADOW.md]}
      testID="live-heart-rate-card"
    >
      <View style={styles.header}>
        <Ionicons name="pulse" size={16} color={colors.primary} />
        <Text style={[styles.label, { color: colors.textMuted }]}>Live</Text>
      </View>

      <View style={styles.readout}>
        <Text
          style={[styles.value, { color: bpm === null ? colors.textMuted : colors.primary }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          testID="live-bpm"
        >
          {bpm === null ? '––' : String(bpm)}
        </Text>
        <Text style={[styles.unit, { color: colors.textSecondary }]}>BPM</Text>
      </View>

      {delta !== null ? (
        <Text style={[styles.delta, { color: colors.textSecondary }]} testID="baseline-delta">
          {delta}
        </Text>
      ) : (
        <Text style={[styles.delta, { color: colors.textMuted }]}>
          {isConnected ? 'Waiting for a reading…' : 'Not connected'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    gap: SPACING.sm,
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    alignSelf: 'flex-start',
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
    gap: SPACING.sm,
  },
  value: {
    fontSize: FONT_SIZE.display,
    fontWeight: '800',
    lineHeight: FONT_SIZE.display * 1.05,
  },
  unit: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    paddingBottom: SPACING.sm,
  },
  delta: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
  },
});
