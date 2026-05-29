import { useEffect, useState } from 'react';
import { useTelemetryBridge } from './hooks/useTelemetryBridge';
import { usePlaybackDriver } from './hooks/usePlaybackDriver';
import { useSettingsStore } from './store/settingsStore';
import { usePlaybackStore } from './store/playbackStore';
import { TopBar } from './components/TopBar';
import { Dashboard } from './components/Dashboard';
import { TrackTab } from './components/TrackTab';
import { TuningTab } from './components/tuning/TuningTab';
import { Settings } from './components/Settings';
import { PanelsDrawer } from './components/PanelsDrawer';
import { PlaybackBar } from './components/PlaybackBar';

type AppTab = 'dashboard' | 'track' | 'tuning';

export function App() {
  useTelemetryBridge();
  usePlaybackDriver();

  const load = useSettingsStore((s) => s.load);
  const ready = useSettingsStore((s) => s.ready);
  const session = usePlaybackStore((s) => s.session);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [panelsOpen, setPanelsOpen] = useState(false);

  // Detect if this is a popped-out window
  const poppedTab = window.forza.getWindowTab() as AppTab | null;
  const [activeTab, setActiveTab] = useState<AppTab>(poppedTab ?? 'dashboard');

  useEffect(() => {
    load();
  }, [load]);

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

  // Popped-out window: show only the requested tab, no tab bar
  if (poppedTab) {
    return (
      <div className="h-screen w-screen flex flex-col overflow-hidden">
        <TopBar
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenPanels={() => setPanelsOpen(true)}
        />
        <div className="flex-1 min-h-0 flex flex-col">
          {poppedTab === 'dashboard' ? <Dashboard /> : poppedTab === 'track' ? <TrackTab /> : <TuningTab />}
        </div>
        {session && <PlaybackBar />}
        <PanelsDrawer open={panelsOpen} onClose={() => setPanelsOpen(false)} />
        <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
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
        <TabButton active={activeTab === 'tuning'} onClick={() => setActiveTab('tuning')}>
          Tuning
        </TabButton>

        <div className="ml-auto flex items-center gap-1">
          <PopOutButton onClick={() => void window.forza.popOutTab(activeTab)} />
        </div>
      </div>

      {/* Tab content — both mount so the 3D scene stays alive when switching */}
      <div className={`flex-1 min-h-0 flex flex-col ${activeTab === 'dashboard' ? '' : 'hidden'}`}>
        <Dashboard />
      </div>
      <div className={`flex-1 min-h-0 flex flex-col ${activeTab === 'track' ? '' : 'hidden'}`}>
        <TrackTab />
      </div>
      <div className={`flex-1 min-h-0 flex flex-col ${activeTab === 'tuning' ? '' : 'hidden'}`}>
        <TuningTab />
      </div>

      {/* Shared playback bar (visible in both tabs when a session is loaded) */}
      {session && <PlaybackBar />}

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

function PopOutButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="h-7 w-7 inline-flex items-center justify-center rounded border border-border-muted bg-bg-input text-text-dim hover:text-text hover:border-border transition-colors"
      title="Pop out tab into separate window"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M7 1h4v4" />
        <path d="M11 1L6 6" />
        <path d="M9 7v3.5a.5.5 0 01-.5.5H1.5a.5.5 0 01-.5-.5V3.5a.5.5 0 01.5-.5H5" />
      </svg>
    </button>
  );
}
