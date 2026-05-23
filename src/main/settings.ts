import Store from 'electron-store';
import { DEFAULT_SETTINGS, type AppSettings } from '@shared/telemetry';

const store = new Store<AppSettings>({
  name: 'settings',
  defaults: DEFAULT_SETTINGS,
});

export function getSettings(): AppSettings {
  // electron-store returns its own type; .store gives us the whole object.
  return { ...DEFAULT_SETTINGS, ...(store.store as AppSettings) };
}

export function setSettings(patch: Partial<AppSettings>): AppSettings {
  const current = getSettings();
  const next: AppSettings = {
    ...current,
    ...patch,
    engineColors: { ...current.engineColors, ...(patch.engineColors ?? {}) },
    visiblePanels: { ...current.visiblePanels, ...(patch.visiblePanels ?? {}) },
  };
  store.store = next;
  return next;
}
