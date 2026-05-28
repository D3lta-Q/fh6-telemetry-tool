import { useTelemetryStore } from '../store/telemetryStore';
import { useSettingsStore } from '../store/settingsStore';
import { useRecordingStore } from '../store/recordingStore';
import { usePlaybackStore } from '../store/playbackStore';
import { useAnimationTick } from '../hooks/useAnimationTick';
import { StatPill, SegmentedControl } from './ui';
import { TIME_WINDOW_OPTIONS } from '@shared/telemetry';

/**
 * Map Forza's numeric CarClass (0..7) to the in-game letter classes.
 * Source: official Forza Data Out doc - CarClass is "0..7 -> D..X".
 */
const CAR_CLASS_LETTERS = ['D', 'C', 'B', 'A', 'S1', 'S2', 'X', 'P'];

function classLetter(carClass: number | undefined): string {
  if (carClass === undefined) return '—';
  return CAR_CLASS_LETTERS[carClass] ?? String(carClass);
}

function formatPacketAge(lastPacketAt: number | null): string {
  if (lastPacketAt === null) return '—';
  const ageMs = Date.now() - lastPacketAt;
  if (ageMs < 1000) return `${ageMs}ms`;
  if (ageMs < 60_000) return `${(ageMs / 1000).toFixed(1)}s`;
  return `${Math.floor(ageMs / 60_000)}m`;
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

interface TopBarProps {
  onOpenSettings: () => void;
  onOpenPanels: () => void;
}

/**
 * Persistent app header. Shows:
 *  - the listener state (port, packets received, "live" indicator)
 *  - the current car (ordinal/class/PI) when one is loaded
 *  - a settings button
 *
 * We tick on rAF rather than subscribing to `frame` so the packet-age readout
 * actually counts up when no packets are arriving (which is the most useful
 * time to be looking at it).
 */
export function TopBar({ onOpenSettings, onOpenPanels }: TopBarProps) {
  useAnimationTick();
  const status = useTelemetryStore.getState().status;
  const latest = useTelemetryStore.getState().latest;
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.update);
  const isRecording = useRecordingStore((s) => s.isRecording);
  const elapsedMs = useRecordingStore((s) => s.elapsedMs);
  const playbackSession = usePlaybackStore((s) => s.session);
  const loadSession = usePlaybackStore((s) => s.loadSession);

  const isLive = status?.lastPacketAt !== null && status?.lastPacketAt !== undefined
    && Date.now() - status.lastPacketAt < 1500;

  return (
    <header className="flex items-center justify-between gap-4 px-5 py-2.5 border-b border-border bg-bg-surface">
      {/* Left: hamburger + brand + listener status */}
      <div className="flex items-center gap-5 min-w-0">
        <button
          onClick={onOpenPanels}
          className="h-8 w-8 inline-flex items-center justify-center rounded border border-border-muted bg-bg-input text-text-muted hover:text-text hover:border-border transition-colors shrink-0"
          title="Show/hide panels"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M3 6h18M3 12h18M3 18h18" />
          </svg>
        </button>

        <div className="flex items-baseline gap-2">
          <span className="text-[15px] font-medium tracking-tight">Forza Telemetry</span>
          <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-dim">
            FH6
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Live indicator dot */}
          <div className="flex items-center gap-1.5">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                isLive
                  ? 'bg-accent-lime animate-pulse-fast'
                  : status?.listening
                    ? 'bg-accent-yellow'
                    : 'bg-text-dim'
              }`}
            />
            <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-text-muted">
              {isLive ? 'LIVE' : status?.listening ? 'LISTENING' : 'OFFLINE'}
            </span>
          </div>

          <StatPill label="PORT" value={String(settings.port)} />
          <StatPill
            label="RX"
            value={status ? status.packetsReceived.toLocaleString() : '0'}
          />
          <StatPill
            label="LAST"
            value={formatPacketAge(status?.lastPacketAt ?? null)}
          />
        </div>

        {status?.error && (
          <span className="text-[11px] font-mono text-accent-red truncate max-w-[28ch]">
            {status.error}
          </span>
        )}
      </div>

      {/* Right: time window selector + car info + settings button */}
      <div className="flex items-center gap-2">
        {/* Global graph time window. Affects every visible chart. */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-dim">
            WINDOW
          </span>
          <SegmentedControl
            value={String(settings.globalTimeWindow)}
            options={TIME_WINDOW_OPTIONS.map((s) => ({
              value: String(s),
              label: s >= 60 ? `${s / 60}m` : `${s}s`,
            }))}
            onChange={(v) => updateSettings({ globalTimeWindow: Number(v) })}
          />
        </div>

        {latest && latest.isRaceOn && (
          <>
            <StatPill label="CAR" value={`#${latest.carOrdinal || '—'}`} />
            <StatPill
              label="CLASS"
              value={classLetter(latest.carClass)}
              accent="#ffd60a"
            />
            <StatPill label="PI" value={String(latest.carPerformanceIndex || '—')} />
          </>
        )}

        {/* Open session button */}
        {!playbackSession && !isRecording && (
          <button
            onClick={() => {
              void window.forza.openTrackSession().then((s) => { if (s) loadSession(s); });
            }}
            className="h-8 px-3 inline-flex items-center gap-1.5 rounded border border-border-muted bg-bg-input hover:border-border text-text-muted hover:text-text transition-colors"
            title="Open a saved .fzt session"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M2 10V3a1 1 0 011-1h2.5l1 1H9a1 1 0 011 1v1" />
              <path d="M1.5 10l1.5-4h8.5l-1.5 4H1.5z" />
            </svg>
            <span className="text-[11px] font-mono uppercase tracking-wider">Open</span>
          </button>
        )}

        {/* Record / Stop Recording button */}
        {isRecording ? (
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono tabular-nums text-accent-red animate-pulse-fast">
              ● {formatElapsed(elapsedMs)}
            </span>
            <button
              onClick={() => void window.forza.stopRecording()}
              className="h-8 px-3 inline-flex items-center gap-1.5 rounded border border-accent-red/60 bg-accent-red/15 text-accent-red hover:bg-accent-red/25 transition-colors"
              title="Stop recording and save"
            >
              <span className="text-[11px] font-mono uppercase tracking-wider">Stop Recording</span>
            </button>
          </div>
        ) : (
          <button
            onClick={() => void window.forza.startRecording()}
            className="h-8 px-3 inline-flex items-center gap-1.5 rounded border border-border-muted bg-bg-input hover:border-border text-text-muted hover:text-text transition-colors"
            title={`Record telemetry session (${settings.recordHotkey})`}
          >
            <span className="inline-block h-2 w-2 rounded-full bg-text-dim" />
            <span className="text-[11px] font-mono uppercase tracking-wider">Record</span>
          </button>
        )}

        <button
          onClick={onOpenSettings}
          className="h-8 px-3 inline-flex items-center gap-1.5 rounded border border-border-muted bg-bg-input hover:border-border text-text-muted hover:text-text transition-colors"
          title="Settings"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          <span className="text-[11px] font-mono uppercase tracking-wider">Settings</span>
        </button>
      </div>
    </header>
  );
}
