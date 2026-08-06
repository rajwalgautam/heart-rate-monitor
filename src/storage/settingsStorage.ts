import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_TRACKING_INTERVAL_MS,
  isValidTrackingInterval,
} from '@/constants/tracking';
import type { ThemeMode } from '@/types';

const SETTINGS_KEY = '@heartratemonitor/settings';

export interface Settings {
  themeMode: ThemeMode;
  /** Device to offer/auto-connect on the Live screen, or null for none. */
  targetDeviceId: string | null;
  /** Human-readable name for `targetDeviceId`, cached for display. */
  targetDeviceName: string | null;
  /** Connect to `targetDeviceId` automatically when the Live tab opens. */
  autoConnect: boolean;
  /** How often an active session records a point, in ms. */
  trackingIntervalMs: number;
}

export const DEFAULT_SETTINGS: Settings = {
  themeMode: 'system',
  targetDeviceId: null,
  targetDeviceName: null,
  autoConnect: false,
  trackingIntervalMs: DEFAULT_TRACKING_INTERVAL_MS,
};

const VALID_MODES: ThemeMode[] = ['light', 'dark', 'system'];

/**
 * Read settings, falling back to defaults for anything missing or malformed.
 * A corrupt blob must not brick the app on boot, so parse failures degrade to
 * defaults rather than throwing.
 */
export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (raw === null) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      themeMode: VALID_MODES.includes(parsed.themeMode as ThemeMode)
        ? (parsed.themeMode as ThemeMode)
        : DEFAULT_SETTINGS.themeMode,
      targetDeviceId:
        typeof parsed.targetDeviceId === 'string' ? parsed.targetDeviceId : null,
      targetDeviceName:
        typeof parsed.targetDeviceName === 'string' ? parsed.targetDeviceName : null,
      autoConnect:
        typeof parsed.autoConnect === 'boolean'
          ? parsed.autoConnect
          : DEFAULT_SETTINGS.autoConnect,
      // Validated against the offered presets, so a value from an older build
      // (or a hand-edited blob) cannot start a session on an interval the UI
      // has no way to represent or change.
      trackingIntervalMs: isValidTrackingInterval(parsed.trackingIntervalMs)
        ? parsed.trackingIntervalMs
        : DEFAULT_SETTINGS.trackingIntervalMs,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
