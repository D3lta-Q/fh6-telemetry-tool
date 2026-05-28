import type { TrackFrame } from '@shared/track';

function formatLapTime(seconds: number): string {
  if (seconds <= 0) return '--:--.---';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}

interface RaceOverlayProps {
  frame: TrackFrame | null;
}

/** Lap-timing overlay shown in the bottom-left of the 3D viewport. */
export function RaceOverlay({ frame }: RaceOverlayProps) {
  if (!frame) return null;

  return (
    <div className="absolute bottom-4 left-4 flex flex-col gap-1 pointer-events-none select-none">
      <TimingRow label="BEST LAP" value={formatLapTime(frame.bestLap)} />
      <TimingRow label="LAST LAP" value={formatLapTime(frame.lastLap)} />
      <TimingRow label="CURRENT " value={formatLapTime(frame.currentLap)} accent />
      <div className="mt-1 border-t border-border-muted pt-1">
        <TimingRow label="LAP     " value={frame.lapNumber >= 0 ? String(frame.lapNumber + 1) : '—'} />
        <TimingRow label="POS     " value={frame.racePos > 0 ? `P${frame.racePos}` : '—'} />
      </div>
    </div>
  );
}

function TimingRow({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-text-dim w-20">{label}</span>
      <span className={`text-sm font-mono tabular-nums ${accent ? 'text-accent-lime' : 'text-text'}`}>
        {value}
      </span>
    </div>
  );
}
