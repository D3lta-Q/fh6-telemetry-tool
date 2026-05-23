import { useEffect, useState } from 'react';
import { useTelemetryBridge } from './hooks/useTelemetryBridge';
import { useSettingsStore } from './store/settingsStore';
import { TopBar } from './components/TopBar';
import { Dashboard } from './components/Dashboard';
import { Settings } from './components/Settings';
import { PanelsDrawer } from './components/PanelsDrawer';

/**
 * Root component.
 *
 * Responsibilities:
 *  - Hydrate the settings store from electron-store on first mount.
 *  - Wire IPC events (telemetry packets + listener status) into Zustand.
 *  - Render the chrome (TopBar) + the dashboard + the two slide-in drawers
 *    (Panels from the left, Settings from the right).
 */
export function App() {
  useTelemetryBridge();

  const load = useSettingsStore((s) => s.load);
  const ready = useSettingsStore((s) => s.ready);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [panelsOpen, setPanelsOpen] = useState(false);

  useEffect(() => {
    load();
  }, [load]);

  // Keyboard shortcuts: Cmd/Ctrl + , for settings (macOS convention),
  // Cmd/Ctrl + B for panels (matching common "toggle sidebar" shortcut).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setSettingsOpen((v) => !v);
      } else if ((e.metaKey || e.ctrlKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        setPanelsOpen((v) => !v);
      } else if (e.key === 'Escape') {
        if (settingsOpen) setSettingsOpen(false);
        if (panelsOpen) setPanelsOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settingsOpen, panelsOpen]);

  if (!ready) {
    return (
      <div className="h-screen w-screen flex items-center justify-center">
        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-text-dim">
          Initializing…
        </span>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden">
      <TopBar
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenPanels={() => setPanelsOpen(true)}
      />
      <Dashboard />
      <PanelsDrawer open={panelsOpen} onClose={() => setPanelsOpen(false)} />
      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
