import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FONT_SIZE, RADIUS, SHADOW, SPACING } from '@/constants/theme';
import { useTheme } from '@/theme/ThemeProvider';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useHeartRateStore } from '@/store/useHeartRateStore';
import {
  formatLastChecked,
  getCurrentVersion,
  getLastCheckedAt,
  performUpdateCheck,
} from '@/utils/updateChecker';
import type { ThemeMode } from '@/types';

const THEME_OPTIONS: Array<{ value: ThemeMode; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

export default function SettingsScreen(): React.JSX.Element {
  const { colors, mode, setMode } = useTheme();
  const insets = useSafeAreaInsets();

  const {
    targetDeviceId,
    targetDeviceName,
    autoConnect,
    setTargetDevice,
    setAutoConnect,
  } = useSettingsStore();
  const connectedDevice = useHeartRateStore((s) => s.connectedDevice);

  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [checkStatus, setCheckStatus] = useState<string | null>(null);

  useEffect(() => {
    void getLastCheckedAt().then(setLastChecked);
  }, []);

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + SPACING.md }]}
    >
      <Text style={[styles.title, { color: colors.textPrimary }]}>Settings</Text>

      <Section title="Appearance">
        <View style={styles.segmented}>
          {THEME_OPTIONS.map((option) => {
            const selected = mode === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => setMode(option.value)}
                style={[
                  styles.segment,
                  {
                    backgroundColor: selected ? colors.primary : colors.surfaceAlt,
                  },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text
                  style={[
                    styles.segmentLabel,
                    { color: selected ? colors.onPrimary : colors.textSecondary },
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Section>

      <Section title="Bluetooth">
        <Row
          label="Saved device"
          value={targetDeviceName ?? targetDeviceId ?? 'None'}
        />
        {connectedDevice !== null && connectedDevice.id !== targetDeviceId && (
          <Pressable
            onPress={() =>
              setTargetDevice(connectedDevice.id, connectedDevice.name)
            }
            style={[styles.action, { backgroundColor: colors.primaryMuted }]}
            accessibilityRole="button"
          >
            <Text style={[styles.actionLabel, { color: colors.primary }]}>
              Save “{connectedDevice.name ?? connectedDevice.id}” as my device
            </Text>
          </Pressable>
        )}
        <View style={styles.switchRow}>
          <View style={styles.switchText}>
            <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>
              Auto-connect
            </Text>
            <Text style={[styles.rowHint, { color: colors.textMuted }]}>
              Connect to the saved device when the Live tab opens.
            </Text>
          </View>
          <Switch
            value={autoConnect}
            onValueChange={setAutoConnect}
            disabled={targetDeviceId === null}
            trackColor={{ true: colors.primary, false: colors.border }}
          />
        </View>
        {targetDeviceId !== null && (
          <Pressable
            onPress={() => setTargetDevice(null, null)}
            accessibilityRole="button"
          >
            <Text style={[styles.clearLabel, { color: colors.danger }]}>
              Clear saved device
            </Text>
          </Pressable>
        )}
      </Section>

      <Section title="About">
        <Row label="Version" value={getCurrentVersion()} />
        <Text style={[styles.rowHint, { color: colors.textMuted }]}>
          {formatLastChecked(lastChecked)}
        </Text>
        {checkStatus !== null && (
          <Text style={[styles.rowHint, { color: colors.textSecondary }]}>
            {checkStatus}
          </Text>
        )}
        <Pressable
          onPress={async () => {
            setCheckStatus('Checking…');
            try {
              const result = await performUpdateCheck();
              setCheckStatus(
                result.isNewer
                  ? `Version ${result.remoteVersion} is available.`
                  : 'You are up to date.',
              );
              setLastChecked(await getLastCheckedAt());
            } catch {
              setCheckStatus('Could not reach GitHub.');
            }
          }}
          style={[styles.action, { backgroundColor: colors.surfaceAlt }]}
          accessibilityRole="button"
        >
          <Text style={[styles.actionLabel, { color: colors.textPrimary }]}>
            Check for updates
          </Text>
        </Pressable>
      </Section>
    </ScrollView>
  );

  function Section({
    title,
    children,
  }: {
    title: string;
    children: React.ReactNode;
  }): React.JSX.Element {
    return (
      <View style={[styles.section, { backgroundColor: colors.surface }, SHADOW.sm]}>
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{title}</Text>
        {children}
      </View>
    );
  }

  function Row({ label, value }: { label: string; value: string }): React.JSX.Element {
    return (
      <View style={styles.row}>
        <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>{label}</Text>
        <Text style={[styles.rowValue, { color: colors.textSecondary }]} numberOfLines={1}>
          {value}
        </Text>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  content: {
    padding: SPACING.md,
    gap: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  title: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '800',
  },
  section: {
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  segmented: {
    flexDirection: 'row',
    gap: SPACING.xs,
  },
  segment: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  segmentLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
  },
  rowLabel: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
  },
  rowValue: {
    flexShrink: 1,
    fontSize: FONT_SIZE.sm,
  },
  rowHint: {
    fontSize: FONT_SIZE.xs,
    lineHeight: FONT_SIZE.xs * 1.4,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
  },
  switchText: {
    flex: 1,
    gap: 2,
  },
  action: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  actionLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
  },
  clearLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
  },
});
