import { useEffect, useState } from 'react';
import { useTelemetryBridge } from './hooks/useTelemetryBridge';
import { useSettingsStore } from './store/settingsStore';
import { TopBar } from './components/TopBar';
import { Dashboard } from './components/Dashboard';
import { TrackTab } from './components/TrackTab';
import { Settings } from './components/Settings';
import { PanelsDrawer } from './components/PanelsDrawer';

type AppTab = 'dashboard' | 'track';

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
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard');

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

      {/* Tab bar */}
      <div className="flex items-center gap-0 px-4 border-b border-border bg-bg-surface shrink-0">
        <TabButton active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')}>
          Dashboard
        </TabButton>
        <TabButton active={activeTab === 'track'} onClick={() => setActiveTab('track')}>
          Track
        </TabButton>
      </div>

      {/* Tab content — both mount so the 3D scene stays alive when switching */}
      <div className={`flex-1 min-h-0 flex flex-col ${activeTab === 'dashboard' ? '' : 'hidden'}`}>
        <Dashboard />
      </div>
      <div className={`flex-1 min-h-0 flex flex-col ${activeTab === 'track' ? '' : 'hidden'}`}>
        <TrackTab />
      </div>

      <PanelsDrawer open={panelsOpen} onClose={() => setPanelsOpen(false)} />
      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-[11px] font-mono uppercase tracking-wider border-b-2 transition-colors ${
        active
          ? 'border-[#00d4ff] text-text'
          : 'border-transparent text-text-dim hover:text-text-muted'
      }`}
    >
      {children}
    </button>
  );
}
