import { create } from 'zustand';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type Settings,
} from '@/storage/settingsStorage';
import type { ThemeMode } from '@/types';

interface SettingsState extends Settings {
  isLoaded: boolean;
  load: () => Promise<void>;
  setThemeMode: (mode: ThemeMode) => void;
  setTargetDevice: (id: string | null, name: string | null) => void;
  setAutoConnect: (value: boolean) => void;
  setTrackingInterval: (ms: number) => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...DEFAULT_SETTINGS,
  isLoaded: false,

  load: async () => {
    const settings = await loadSettings();
    set({ ...settings, isLoaded: true });
  },

  setThemeMode: (mode) => {
    set({ themeMode: mode });
    void persist(get);
  },

  setTargetDevice: (id, name) => {
    set({ targetDeviceId: id, targetDeviceName: name });
    void persist(get);
  },

  setAutoConnect: (value) => {
    set({ autoConnect: value });
    void persist(get);
  },

  setTrackingInterval: (ms) => {
    set({ trackingIntervalMs: ms });
    void persist(get);
  },
}));

function persist(get: () => SettingsState): Promise<void> {
  const { themeMode, targetDeviceId, targetDeviceName, autoConnect, trackingIntervalMs } =
    get();
  return saveSettings({
    themeMode,
    targetDeviceId,
    targetDeviceName,
    autoConnect,
    trackingIntervalMs,
  });
}
