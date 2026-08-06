import { useCallback, useEffect, useState } from 'react';
import {
  AppState,
  LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { FONT_SIZE, RADIUS, SHADOW, SPACING } from '@/constants/theme';
import { useTheme } from '@/theme/ThemeProvider';
import { useBaselineStore } from '@/store/useBaselineStore';
import { useHeartRateStore } from '@/store/useHeartRateStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { BaselineStatCard } from '@/components/BaselineStatCard';
import { ConnectionManager } from '@/components/ConnectionManager';
import { HeartRateChart } from '@/components/HeartRateChart';
import { LiveHeartRateCard } from '@/components/LiveHeartRateCard';
import { SessionTimer } from '@/components/SessionTimer';
import { UpdateBanner } from '@/components/UpdateBanner';
import { TRACKING_INTERVALS } from '@/constants/tracking';

/**
 * The Live dashboard. Owns the resource lifecycle contract in
 * implementation.md §8.1 — it is the only screen that starts BLE scans,
 * connections, and the baseline poll timer, so it is the only screen
 * responsible for releasing them.
 */
export default function LiveScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const {
    connectionState,
    connectedDevice,
    liveHeartRate,
    discoveredDevices,
    activeSession,
    sessionSeries,
    error,
    startScan,
    stopScan,
    connectToDevice,
    disconnect,
    startSession,
    endSession,
    teardown,
    clearError,
  } = useHeartRateStore();

  const {
    baselineHeartRate,
    lastUpdated,
    isLoading,
    isStale,
    status,
    initialize,
    requestAccess,
    refreshNow,
    fetchBaseline,
    startPolling,
    stopPolling,
  } = useBaselineStore();

  const autoConnect = useSettingsStore((s) => s.autoConnect);
  const targetDeviceId = useSettingsStore((s) => s.targetDeviceId);
  const trackingIntervalMs = useSettingsStore((s) => s.trackingIntervalMs);

  // Measured rather than derived from Dimensions, so the chart is correct
  // inside the scroll view's padding and after a rotation.
  const [chartWidth, setChartWidth] = useState(0);
  const onChartLayout = useCallback((e: LayoutChangeEvent) => {
    setChartWidth(e.nativeEvent.layout.width);
  }, []);

  const intervalLabel =
    TRACKING_INTERVALS.find((o) => o.ms === trackingIntervalMs)?.label ?? '';

  // One-time Health Connect availability probe.
  useEffect(() => {
    void initialize();
  }, [initialize]);

  // Optional auto-connect to the saved device, once, on first mount.
  useEffect(() => {
    if (autoConnect && targetDeviceId !== null && connectionState === 'disconnected') {
      void connectToDevice(targetDeviceId);
    }
    // Intentionally mount-only: re-running on every connectionState change
    // would reconnect immediately after a deliberate user disconnect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll only while this screen is focused — §8.1 rule 4.
  useFocusEffect(
    useCallback(() => {
      startPolling();
      return () => {
        stopPolling();
        stopScan();
      };
    }, [startPolling, stopPolling, stopScan]),
  );

  // Background/foreground handling. An active session takes precedence: the BLE
  // connection is held (the connection lock) while the poll timer stops, so a
  // backgrounded workout keeps recording. See §8.1 rule 5.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        void fetchBaseline();
        startPolling();
      } else {
        stopPolling();
        stopScan();
        if (useHeartRateStore.getState().activeSession === null) {
          teardown();
        }
      }
    });
    return () => subscription.remove();
  }, [fetchBaseline, startPolling, stopPolling, stopScan, teardown]);

  const isSessionActive = activeSession !== null;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + SPACING.md },
      ]}
    >
      <UpdateBanner />

      <Text style={[styles.title, { color: colors.textPrimary }]}>Heart Rate</Text>

      {error !== null && (
        <Pressable
          onPress={clearError}
          style={[styles.error, { backgroundColor: colors.primaryMuted }]}
          accessibilityRole="button"
        >
          <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
        </Pressable>
      )}

      <LiveHeartRateCard
        bpm={liveHeartRate}
        baseline={baselineHeartRate}
        isConnected={connectionState === 'connected'}
      />

      {isSessionActive && <SessionTimer startTime={activeSession.startTime} />}

      {isSessionActive && (
        <View
          style={[styles.chartCard, { backgroundColor: colors.surface }, SHADOW.sm]}
          onLayout={onChartLayout}
        >
          <View style={styles.chartHeader}>
            <Text style={[styles.chartTitle, { color: colors.textMuted }]}>
              Session heart rate
            </Text>
            <Text style={[styles.chartMeta, { color: colors.textMuted }]}>
              every {intervalLabel}
            </Text>
          </View>
          {chartWidth > 0 && (
            <HeartRateChart
              points={sessionSeries}
              baseline={baselineHeartRate}
              width={chartWidth - SPACING.md * 2}
              emptyLabel={`Recording — first point in up to ${intervalLabel}`}
            />
          )}
        </View>
      )}

      <BaselineStatCard
        baseline={baselineHeartRate}
        lastUpdated={lastUpdated}
        isLoading={isLoading}
        isStale={isStale}
        status={status}
        onRefresh={() => void refreshNow()}
        onRequestAccess={() => void requestAccess()}
      />

      <ConnectionManager
        connectionState={connectionState}
        connectedDevice={connectedDevice}
        discoveredDevices={discoveredDevices}
        onScan={() => void startScan()}
        onStopScan={stopScan}
        onConnect={(id) => void connectToDevice(id)}
        onDisconnect={() => void disconnect()}
      />

      <Pressable
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          void (isSessionActive ? endSession() : startSession(trackingIntervalMs));
        }}
        disabled={connectionState !== 'connected' && !isSessionActive}
        style={[
          styles.sessionButton,
          {
            backgroundColor:
              connectionState !== 'connected' && !isSessionActive
                ? colors.surfaceAlt
                : isSessionActive
                  ? colors.surfaceAlt
                  : colors.primary,
          },
        ]}
        accessibilityRole="button"
        testID="session-button"
      >
        <Ionicons
          name={isSessionActive ? 'stop' : 'play'}
          size={20}
          color={
            connectionState !== 'connected' && !isSessionActive
              ? colors.textMuted
              : isSessionActive
                ? colors.textPrimary
                : colors.onPrimary
          }
        />
        <Text
          style={[
            styles.sessionLabel,
            {
              color:
                connectionState !== 'connected' && !isSessionActive
                  ? colors.textMuted
                  : isSessionActive
                    ? colors.textPrimary
                    : colors.onPrimary,
            },
          ]}
        >
          {isSessionActive ? 'End session' : 'Start session'}
        </Text>
      </Pressable>

      {!isSessionActive && (
        <Text style={[styles.hint, { color: colors.textMuted }]}>
          {connectionState === 'connected'
            ? `Records a point every ${intervalLabel}. Change this in Settings.`
            : 'Connect a heart rate monitor to start tracking.'}
        </Text>
      )}
    </ScrollView>
  );
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
  error: {
    padding: SPACING.sm,
    borderRadius: RADIUS.md,
  },
  errorText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
  },
  sessionButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.lg,
  },
  sessionLabel: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '800',
  },
  hint: {
    fontSize: FONT_SIZE.xs,
    textAlign: 'center',
  },
  chartCard: {
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chartTitle: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chartMeta: {
    fontSize: FONT_SIZE.xs,
  },
});
