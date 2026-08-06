import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';
import { initDatabase } from '@/db/database';
import { useSettingsStore } from '@/store/useSettingsStore';
import { cleanupPendingApk } from '@/utils/updateChecker';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

export default function RootLayout(): React.JSX.Element {
  const [ready, setReady] = useState(false);
  const loadSettings = useSettingsStore((s) => s.load);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await initDatabase();
      await loadSettings();
      if (!cancelled) setReady(true);
      void cleanupPendingApk();
    })();
    return () => {
      cancelled = true;
    };
  }, [loadSettings]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <StatusBar style="auto" />
          {ready ? <Navigator /> : <SplashFallback />}
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Navigator(): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.textPrimary,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="sessions/[id]" options={{ title: 'Session' }} />
    </Stack>
  );
}

function SplashFallback(): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.background,
      }}
    >
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}
