import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONT_SIZE, RADIUS, SPACING } from '@/constants/theme';
import { useTheme } from '@/theme/ThemeProvider';
import { formatDuration } from '@/utils/format';

interface SessionTimerProps {
  /** Epoch ms the session started. */
  startTime: number;
}

/** Ticking elapsed-time readout, visible only while a session is active. */
export function SessionTimer({ startTime }: SessionTimerProps): React.JSX.Element {
  const { colors } = useTheme();
  const [elapsed, setElapsed] = useState(() => Date.now() - startTime);

  useEffect(() => {
    // Recompute from `startTime` rather than incrementing a counter, so the
    // display stays correct across a background/foreground cycle where the
    // interval does not fire.
    const id = setInterval(() => setElapsed(Date.now() - startTime), 1000);
    setElapsed(Date.now() - startTime);
    return () => clearInterval(id);
  }, [startTime]);

  return (
    <View
      style={[styles.container, { backgroundColor: colors.primaryMuted }]}
      testID="session-timer"
    >
      <Ionicons name="stopwatch" size={16} color={colors.primary} />
      <Text style={[styles.time, { color: colors.primary }]}>
        {formatDuration(elapsed)}
      </Text>
      <Text style={[styles.label, { color: colors.primary }]}>Session</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    alignSelf: 'center',
  },
  time: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  label: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
