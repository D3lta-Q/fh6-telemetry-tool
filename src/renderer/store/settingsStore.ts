import { create } from 'zustand';
import { DEFAULT_SETTINGS, type AppSettings } from '@shared/telemetry';

interface SettingsStoreState {
  settings: AppSettings;
  ready: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<AppSettings>) => Promise<void>;
}

export const useSettingsStore = create<SettingsStoreState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  ready: false,

  load: async () => {
    const settings = await window.forza.getSettings();
    set({ settings, ready: true });
  },

  update: async (patch) => {
    // Optimistic update so UI reacts instantly; the main process is the
    // source of truth and will return the merged result.
    const current = get().settings;
    const optimistic: AppSettings = {
      ...current,
      ...patch,
      engineColors: { ...current.engineColors, ...(patch.engineColors ?? {}) },
      visiblePanels: { ...current.visiblePanels, ...(patch.visiblePanels ?? {}) },
    };
    set({ settings: optimistic });
    const next = await window.forza.setSettings(patch);
    set({ settings: next });
  },
}));
