import { useState } from 'react';
import { usePlaybackStore } from '../store/playbackStore';

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Shared playback bar shown at the bottom of the app when a recording
 * session is loaded. Works across both Dashboard and Track tabs with
 * synchronized position.
 */
export function PlaybackBar() {
  const session = usePlaybackStore((s) => s.session);
  const packetIndex = usePlaybackStore((s) => s.packetIndex);
  const frameIndex = usePlaybackStore((s) => s.frameIndex);
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const setPlaying = usePlaybackStore((s) => s.setPlaying);
  const seekToTime = usePlaybackStore((s) => s.seekToTime);
  const closeSession = usePlaybackStore((s) => s.closeSession);

  const [showLaps, setShowLaps] = useState(true);
  const [showPositions, setShowPositions] = useState(true);

  if (!session) return null;

  const hasPackets = session.packets.length > 0;
  const hasFrames = session.frames.length > 0;
  const totalMs = session.endedAt - session.startedAt;

  // Determine current time from whichever data source is available
  let currentMs = 0;
  if (hasPackets) {
    const pkt = session.packets[packetIndex];
    currentMs = pkt ? pkt.receivedAt - session.startedAt : 0;
  } else if (hasFrames) {
    const frame = session.frames[frameIndex];
    currentMs = frame ? frame.t - session.startedAt : 0;
  }

  // Use a unified slider from 0 to totalMs
  const sliderValue = currentMs;
  const sliderMax = totalMs;

  const hasLaps = session.laps.length > 0;
  const hasPositions = session.positionChanges.length > 0;

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const ms = Number(e.target.value);
    if (isPlaying) setPlaying(false);
    seekToTime(ms);
  };

  const handleTogglePlay = () => {
    setPlaying(!isPlaying);
  };

  return (
    <div className="flex flex-col bg-bg-surface/95 backdrop-blur border-t border-border shrink-0">
      {/* Timeline markers row */}
      {(hasLaps || hasPositions) && (
        <div className="relative h-4 mx-[72px] mr-[180px]">
          {showLaps && session.laps.map((lap, i) => {
            const lapFrame = session.frames[lap.startFrame];
            if (!lapFrame) return null;
            const lapTimeMs = lapFrame.t - session.startedAt;
            return (
              <div
                key={`lap-${i}`}
                className="absolute top-0.5 w-px h-3 bg-[#ffd60a]"
                style={{ left: `${(lapTimeMs / totalMs) * 100}%` }}
                title={`Lap ${lap.lapNumber}`}
              />
            );
          })}
          {showPositions && session.positionChanges.map((pc, i) => {
            const pcFrame = session.frames[pc.frameIndex];
            if (!pcFrame) return null;
            const pcTimeMs = pcFrame.t - session.startedAt;
            const gained = pc.to < pc.from;
            return (
              <div
                key={`pos-${i}`}
                className="absolute top-0 flex flex-col items-center"
                style={{ left: `${(pcTimeMs / totalMs) * 100}%` }}
                title={`P${pc.from} → P${pc.to}`}
              >
                <span className={`text-[7px] font-mono leading-none ${gained ? 'text-[#a3ff12]' : 'text-[#ff3c1c]'}`}>
                  {gained ? '▲' : '▼'}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Controls row */}
      <div className="flex items-center gap-3 px-4 py-2.5">
        <button
          onClick={handleTogglePlay}
          className="h-7 w-7 inline-flex items-center justify-center rounded border border-border-muted bg-bg-input text-text-muted hover:text-text hover:border-border transition-colors shrink-0"
        >
          {isPlaying ? (
            <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor">
              <rect x="0" y="0" width="3" height="12" /><rect x="7" y="0" width="3" height="12" />
            </svg>
          ) : (
            <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor">
              <polygon points="0,0 10,6 0,12" />
            </svg>
          )}
        </button>

        <span className="text-[10px] font-mono text-text-muted tabular-nums w-10 shrink-0">
          {formatTime(currentMs)}
        </span>

        <input
          type="range"
          min={0}
          max={sliderMax}
          value={sliderValue}
          onChange={handleSliderChange}
          className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer bg-bg-input accent-[#00d4ff]"
        />

        <span className="text-[10px] font-mono text-text-dim tabular-nums w-10 shrink-0 text-right">
          {formatTime(totalMs)}
        </span>

        <span className="text-[9px] font-mono uppercase tracking-wider text-text-dim shrink-0">
          {hasPackets
            ? `${session.packets.length.toLocaleString()} pkts`
            : `${session.frames.length.toLocaleString()} pts`}
        </span>

        {/* Marker visibility toggles */}
        {hasLaps && (
          <button
            onClick={() => setShowLaps((v) => !v)}
            title="Toggle lap markers"
            className={`h-5 px-1.5 rounded text-[8px] font-mono uppercase tracking-wider border transition-colors ${
              showLaps
                ? 'border-[#ffd60a]/50 bg-[#ffd60a]/15 text-[#ffd60a]'
                : 'border-border-muted text-text-dim hover:text-text-muted'
            }`}
          >
            Laps
          </button>
        )}
        {hasPositions && (
          <button
            onClick={() => setShowPositions((v) => !v)}
            title="Toggle position markers"
            className={`h-5 px-1.5 rounded text-[8px] font-mono uppercase tracking-wider border transition-colors ${
              showPositions
                ? 'border-[#a3ff12]/50 bg-[#a3ff12]/15 text-[#a3ff12]'
                : 'border-border-muted text-text-dim hover:text-text-muted'
            }`}
          >
            Pos
          </button>
        )}

        {/* Close session button */}
        <button
          onClick={closeSession}
          title="Close recording"
          className="h-5 px-1.5 rounded text-[8px] font-mono uppercase tracking-wider border border-border-muted text-text-dim hover:text-accent-red hover:border-accent-red/50 transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}
