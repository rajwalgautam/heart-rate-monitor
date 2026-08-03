import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONT_SIZE, RADIUS, SHADOW, SPACING } from '@/constants/theme';
import { useTheme } from '@/theme/ThemeProvider';
import type { BleDevice, ConnectionState } from '@/types';

interface ConnectionManagerProps {
  connectionState: ConnectionState;
  connectedDevice: BleDevice | null;
  discoveredDevices: BleDevice[];
  onScan: () => void;
  onStopScan: () => void;
  onConnect: (deviceId: string) => void;
  onDisconnect: () => void;
}

const STATUS_LABEL: Record<ConnectionState, string> = {
  disconnected: 'Disconnected',
  scanning: 'Scanning…',
  connecting: 'Connecting…',
  connected: 'Connected',
};

/** Scan / connect / disconnect controls plus the discovered-device list. */
export function ConnectionManager({
  connectionState,
  connectedDevice,
  discoveredDevices,
  onScan,
  onStopScan,
  onConnect,
  onDisconnect,
}: ConnectionManagerProps): React.JSX.Element {
  const { colors } = useTheme();
  const isBusy = connectionState === 'scanning' || connectionState === 'connecting';

  const statusColor =
    connectionState === 'connected'
      ? colors.success
      : isBusy
        ? colors.warning
        : colors.textMuted;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }, SHADOW.sm]}>
      <View style={styles.statusRow}>
        <View style={styles.statusLeft}>
          <View style={[styles.dot, { backgroundColor: statusColor }]} />
          <View>
            <Text style={[styles.status, { color: colors.textPrimary }]} testID="connection-status">
              {STATUS_LABEL[connectionState]}
            </Text>
            {connectedDevice !== null && (
              <Text style={[styles.deviceName, { color: colors.textMuted }]}>
                {connectedDevice.name ?? connectedDevice.id}
              </Text>
            )}
          </View>
        </View>

        {connectionState === 'connected' ? (
          <Pressable
            onPress={onDisconnect}
            style={[styles.button, { backgroundColor: colors.surfaceAlt }]}
            accessibilityRole="button"
            testID="disconnect-button"
          >
            <Text style={[styles.buttonLabel, { color: colors.textPrimary }]}>
              Disconnect
            </Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={connectionState === 'scanning' ? onStopScan : onScan}
            disabled={connectionState === 'connecting'}
            style={[styles.button, { backgroundColor: colors.primaryMuted }]}
            accessibilityRole="button"
            testID="scan-button"
          >
            {connectionState === 'connecting' ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={[styles.buttonLabel, { color: colors.primary }]}>
                {connectionState === 'scanning' ? 'Stop' : 'Scan'}
              </Text>
            )}
          </Pressable>
        )}
      </View>

      {connectionState !== 'connected' && discoveredDevices.length > 0 && (
        <View style={styles.deviceList}>
          {discoveredDevices.map((device) => (
            <Pressable
              key={device.id}
              onPress={() => onConnect(device.id)}
              style={[styles.deviceRow, { borderTopColor: colors.border }]}
              accessibilityRole="button"
              testID={`device-${device.id}`}
            >
              <Ionicons name="bluetooth" size={16} color={colors.textSecondary} />
              <Text style={[styles.deviceLabel, { color: colors.textPrimary }]}>
                {device.name ?? 'Unnamed device'}
              </Text>
              {device.rssi !== null && (
                <Text style={[styles.rssi, { color: colors.textMuted }]}>
                  {device.rssi} dBm
                </Text>
              )}
            </Pressable>
          ))}
        </View>
      )}

      {connectionState === 'scanning' && discoveredDevices.length === 0 && (
        <Text style={[styles.hint, { color: colors.textMuted }]}>
          Looking for heart rate monitors…
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: RADIUS.full,
  },
  status: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
  },
  deviceName: {
    fontSize: FONT_SIZE.xs,
  },
  button: {
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    minWidth: 88,
    alignItems: 'center',
  },
  buttonLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
  },
  deviceList: {
    gap: 0,
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  deviceLabel: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
  },
  rssi: {
    fontSize: FONT_SIZE.xs,
  },
  hint: {
    fontSize: FONT_SIZE.sm,
  },
});
