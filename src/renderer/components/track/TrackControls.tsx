import { usePlaybackStore } from '../../store/playbackStore';
import type { TrackMode, PathColorMetric } from '@shared/track';
import { PATH_COLOR_METRIC_LABELS } from '@shared/track';

interface TrackControlsProps {
  mode: TrackMode;
  isTracking: boolean;
  metric: PathColorMetric;
  onSetMode: (m: TrackMode) => void;
  onSetMetric: (m: PathColorMetric) => void;
  onStart: () => void;
  onStop: () => void;
  onOpen: () => void;
  onClosePlayback: () => void;
}

export function TrackControls({
  mode, isTracking, metric,
  onSetMode, onSetMetric,
  onStart, onStop, onOpen, onClosePlayback,
}: TrackControlsProps) {
  const playbackSession = usePlaybackStore((s) => s.session);
  const isPlayback = playbackSession !== null && playbackSession.frames.length > 0;

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-bg-surface shrink-0 flex-wrap">
      {isPlayback ? (
        <>
          <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-text-dim">
            PLAYBACK
          </span>
          <span className="text-xs font-mono text-text-muted">
            {playbackSession.mode === 'race' ? 'Race Mode' : 'Free Mode'}
            {' · '}
            {playbackSession.frames.length.toLocaleString()} frames
          </span>

          <div className="w-px h-4 bg-border-muted" />

          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-text-dim">COLOR</span>
            <MetricPicker value={metric} onChange={onSetMetric} />
          </div>

          <div className="flex-1" />
          <button
            onClick={onClosePlayback}
            className="h-7 px-3 rounded border border-border-muted bg-bg-input text-[10px] font-mono uppercase tracking-wider text-text-muted hover:text-text hover:border-border transition-colors"
          >
            ← Back to Live
          </button>
        </>
      ) : (
        <>
          {/* Mode selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-text-dim">MODE</span>
            <ModeToggle value={mode} onChange={onSetMode} disabled={isTracking} />
          </div>

          <div className="w-px h-4 bg-border-muted" />

          {/* Color metric selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-text-dim">COLOR</span>
            <MetricPicker value={metric} onChange={onSetMetric} />
          </div>

          <div className="flex-1" />

          {/* Open file */}
          <button
            onClick={onOpen}
            className="h-7 px-3 rounded border border-border-muted bg-bg-input text-[10px] font-mono uppercase tracking-wider text-text-muted hover:text-text hover:border-border transition-colors"
          >
            Open .fzt
          </button>

          {/* Start / Stop */}
          {isTracking ? (
            <button
              onClick={onStop}
              className="h-7 px-3 rounded border border-accent-red/60 bg-accent-red/15 text-[10px] font-mono uppercase tracking-wider text-accent-red hover:bg-accent-red/25 transition-colors"
            >
              ■ Stop &amp; Save
            </button>
          ) : (
            <button
              onClick={onStart}
              className="h-7 px-3 rounded border border-border-muted bg-bg-input text-[10px] font-mono uppercase tracking-wider text-text-muted hover:text-text hover:border-border transition-colors"
            >
              ● Start
            </button>
          )}
        </>
      )}
    </div>
  );
}

function ModeToggle({ value, onChange, disabled }: { value: TrackMode; onChange: (m: TrackMode) => void; disabled: boolean }) {
  return (
    <div className="inline-flex bg-bg-input rounded border border-border-muted p-0.5">
      {(['free', 'race'] as TrackMode[]).map((m) => (
        <button
          key={m}
          disabled={disabled}
          onClick={() => onChange(m)}
          className={`px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider rounded-sm transition-colors disabled:opacity-40 ${
            value === m ? 'bg-bg-elevated text-text' : 'text-text-dim hover:text-text-muted'
          }`}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

function MetricPicker({ value, onChange }: { value: PathColorMetric; onChange: (m: PathColorMetric) => void }) {
  return (
    <div className="inline-flex bg-bg-input rounded border border-border-muted p-0.5">
      {(Object.keys(PATH_COLOR_METRIC_LABELS) as PathColorMetric[]).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={`px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider rounded-sm transition-colors ${
            value === m ? 'bg-bg-elevated text-text' : 'text-text-dim hover:text-text-muted'
          }`}
        >
          {PATH_COLOR_METRIC_LABELS[m]}
        </button>
      ))}
    </div>
  );
}
