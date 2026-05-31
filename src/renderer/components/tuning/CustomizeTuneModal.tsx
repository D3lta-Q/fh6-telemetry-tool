import { useState } from 'react';
import type { TuneModifiers } from '@shared/tuning';
import { DEFAULT_MODIFIERS } from '@shared/tuning';

const MIN = 80;
const MAX = 120;
const STEP = 1;

interface SliderDef {
  key: keyof TuneModifiers;
  label: string;
  loLabel: string;
  hiLabel: string;
}

const SLIDERS: SliderDef[] = [
  { key: 'accelTopSpeed',    label: 'Tune Focus',          loLabel: 'Acceleration', hiLabel: 'Top Speed' },
  { key: 'overallBalance',   label: 'Overall Balance',     loLabel: 'Understeer',   hiLabel: 'Oversteer' },
  { key: 'turnEntryBalance', label: 'Turn Entry Balance',  loLabel: 'Understeer',   hiLabel: 'Oversteer' },
  { key: 'turnExitBalance',  label: 'Turn Exit Balance',   loLabel: 'Understeer',   hiLabel: 'Oversteer' },
  { key: 'rideStiffness',    label: 'Ride Stiffness',      loLabel: 'Softer',       hiLabel: 'Firmer' },
  { key: 'rollStiffness',    label: 'Roll Stiffness',      loLabel: 'Softer',       hiLabel: 'Firmer' },
];

interface Props {
  initial: TuneModifiers;
  hasGearing: boolean;
  onDone: (m: TuneModifiers) => void;
  onCancel: () => void;
}

export function CustomizeTuneModal({ initial, hasGearing, onDone, onCancel }: Props) {
  const [values, setValues] = useState<TuneModifiers>({ ...initial });

  const set = (key: keyof TuneModifiers, raw: number) => {
    const v = Math.round(Math.min(MAX, Math.max(MIN, raw)));
    setValues((prev) => ({ ...prev, [key]: v }));
  };

  const reset = () => setValues({ ...DEFAULT_MODIFIERS });

  const visibleSliders = hasGearing ? SLIDERS : SLIDERS.filter((s) => s.key !== 'accelTopSpeed');

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Panel */}
      <div className="fixed z-50 inset-x-0 bottom-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 w-full sm:w-[480px] max-h-[92dvh] flex flex-col rounded-t-2xl sm:rounded-xl border border-border bg-bg-surface shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
          <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-text-dim">Customize Tune</span>
          <div className="flex items-center gap-2">
            <button
              onClick={reset}
              className="h-7 px-2.5 rounded border border-border-muted text-[10px] font-mono uppercase tracking-wider text-text-dim hover:text-text hover:border-border transition-colors"
            >
              Reset
            </button>
            <button
              onClick={onCancel}
              className="h-7 px-2.5 rounded border border-border-muted text-[10px] font-mono uppercase tracking-wider text-text-dim hover:text-text hover:border-border transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onDone(values)}
              className="h-7 px-3 rounded border border-accent-lime/40 bg-accent-lime/10 text-[10px] font-mono uppercase tracking-wider text-accent-lime hover:bg-accent-lime/20 transition-colors"
            >
              Done
            </button>
          </div>
        </div>

        {/* Sliders */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">
          {visibleSliders.map(({ key, label, loLabel, hiLabel }) => (
            <SliderRow
              key={key}
              label={label}
              loLabel={loLabel}
              hiLabel={hiLabel}
              value={values[key]}
              onChange={(v) => set(key, v)}
            />
          ))}

          {/* Help text */}
          <div className="mt-2 pt-4 border-t border-border-muted text-[11px] text-text-muted leading-relaxed space-y-2.5">
            <p>
              <span className="font-semibold text-text">Balance Tuning:</span>{' '}
              If the front end of your car tends to slip or push during a turn, increase{' '}
              <Tag>Overall Balance</Tag> towards oversteer. If the car spins too easily or you
              want a more stable setup, decrease it towards understeer.
            </p>
            <p>
              <Tag>Overall Balance</Tag> will have a larger effect in the middle of the turn. You
              can also adjust balance as you enter a turn using{' '}
              <Tag>Turn Entry Balance</Tag> and change the balance coming out of the turn using{' '}
              <Tag>Turn Exit Balance</Tag>.
            </p>
            <p>
              <span className="font-semibold text-text">Stiffness Tuning:</span>{' '}
              Reduce <Tag>Ride Stiffness</Tag> if you prefer a softer, more planted feel in longer
              turns. Increase it for quicker transitions and a more "on edge" feel. Increase{' '}
              <Tag>Roll Stiffness</Tag> to stay flatter in turns.
            </p>
            {hasGearing && (
              <p>
                <span className="font-semibold text-text">Tune Focus:</span>{' '}
                Biases gear spacing toward tighter ratios (acceleration) or wider spread (top
                speed). Use <Tag>Acceleration</Tag> for drag and short tracks,{' '}
                <Tag>Top Speed</Tag> for long straights.
              </p>
            )}
            <p className="text-text-dim">
              <span className="font-semibold">Note:</span> 1–5% adjustments will have a noticeable
              difference. Values between 80 and 120 usually give better results. More extreme
              adjustments may produce unpredictable results.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] uppercase tracking-wide text-text bg-bg-elevated border border-border-muted rounded px-1 py-0.5">
      {children}
    </span>
  );
}

function SliderRow({
  label, loLabel, hiLabel, value, onChange,
}: {
  label: string;
  loLabel: string;
  hiLabel: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const pct = ((value - MIN) / (MAX - MIN)) * 100;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-mono uppercase tracking-[0.15em] text-text">{label}</span>
        <span className="text-xs font-mono tabular-nums text-text-muted w-8 text-right">{value}</span>
      </div>

      <div className="flex items-center gap-2.5">
        {/* Minus */}
        <button
          onClick={() => onChange(value - STEP)}
          disabled={value <= MIN}
          className="w-6 h-6 flex items-center justify-center rounded-full border border-border-muted text-text-dim hover:text-text hover:border-border transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-sm leading-none"
          aria-label={`Decrease ${label}`}
        >
          −
        </button>

        {/* Track */}
        <div className="relative flex-1 h-1.5 rounded-full bg-bg-elevated">
          {/* Filled portion */}
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-accent-lime/60"
            style={{ width: `${pct}%` }}
          />
          {/* Thumb */}
          <input
            type="range"
            min={MIN}
            max={MAX}
            step={STEP}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
            aria-label={label}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-text border-2 border-bg-surface shadow-sm pointer-events-none"
            style={{ left: `calc(${pct}% - 8px)` }}
          />
        </div>

        {/* Plus */}
        <button
          onClick={() => onChange(value + STEP)}
          disabled={value >= MAX}
          className="w-6 h-6 flex items-center justify-center rounded-full border border-border-muted text-text-dim hover:text-text hover:border-border transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-sm leading-none"
          aria-label={`Increase ${label}`}
        >
          +
        </button>
      </div>

      {/* Axis labels */}
      <div className="flex justify-between text-[9px] font-mono uppercase tracking-wider text-text-dim px-8">
        <span>{loLabel}</span>
        <span>{hiLabel}</span>
      </div>
    </div>
  );
}
