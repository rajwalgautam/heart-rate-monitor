import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONT_SIZE, RADIUS, SPACING } from '@/constants/theme';
import { useTheme } from '@/theme/ThemeProvider';
import {
  downloadAndInstallApk,
  getLastNotifiedVersion,
  markVersionNotified,
  performUpdateCheck,
} from '@/utils/updateChecker';

/**
 * Prompts once per newer release. Every network path degrades to rendering
 * nothing — the app is offline-first, so a failed update check must be
 * invisible rather than an error state.
 */
export function UpdateBanner(): React.JSX.Element | null {
  const { colors } = useTheme();
  const [version, setVersion] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await performUpdateCheck();
        if (cancelled || !result.isNewer) return;
        const alreadyNotified = await getLastNotifiedVersion();
        if (alreadyNotified === result.remoteVersion) return;
        if (!cancelled) setVersion(result.remoteVersion);
      } catch {
        // Offline, rate limited, or no releases yet. Stay silent.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (version === null || dismissed) return null;

  return (
    <View style={[styles.banner, { backgroundColor: colors.primaryMuted }]} testID="update-banner">
      <Ionicons name="arrow-down-circle" size={18} color={colors.primary} />
      <Text style={[styles.text, { color: colors.primary }]}>
        Version {version} is available
      </Text>
      {installing ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <>
          <Pressable
            onPress={async () => {
              setInstalling(true);
              try {
                await downloadAndInstallApk(version);
                await markVersionNotified(version);
              } catch {
                setInstalling(false);
              }
            }}
            accessibilityRole="button"
            testID="update-install"
          >
            <Text style={[styles.action, { color: colors.primary }]}>Install</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              void markVersionNotified(version);
              setDismissed(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Dismiss update"
            hitSlop={8}
          >
            <Ionicons name="close" size={16} color={colors.primary} />
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    padding: SPACING.sm,
    borderRadius: RADIUS.md,
  },
  text: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
  },
  action: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '800',
  },
});
