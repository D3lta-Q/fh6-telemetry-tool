import type { TuneResult } from '@shared/tuning';
import {
  springFromLbIn,
  pressureFromPsi,
  SPRING_UNIT_LABELS,
  PRESSURE_UNIT_LABELS,
} from '@shared/tuning';
import type { TuningUnits } from '../../store/tuningStore';

/**
 * Renders a calculated tune. Spring rates and tyre pressures are converted
 * from the engine's internal units (lb/in, psi) to the user's chosen display
 * units; other values are unit-agnostic (degrees, percentages, slider clicks).
 */
export function ResultsPanel({ result, units }: { result: TuneResult; units: TuningUnits }) {
  const psi = (v: number) => pressureFromPsi(v, units.pressure);
  const spring = (v: number) => springFromLbIn(v, units.spring);
  const pUnit = PRESSURE_UNIT_LABELS[units.pressure];
  const sUnit = SPRING_UNIT_LABELS[units.spring];

  const pDec = units.pressure === 'bar' ? 2 : 1;
  const sDec = units.spring === 'lbin' ? 0 : 2;

  return (
    <div className="flex flex-col gap-5">
      <Group title="Tires" tag="PRESSURE">
        <Pair label="Front" value={psi(result.tires.front.englishValueAsNumber).toFixed(pDec)} unit={pUnit} />
        <Pair label="Rear" value={psi(result.tires.rear.englishValueAsNumber).toFixed(pDec)} unit={pUnit} />
      </Group>

      <Group title="Alignment" tag="GEOMETRY">
        <Pair label="Front Camber" value={result.alignment.frontCamber.englishValueAsNumber.toFixed(1)} unit="°" />
        <Pair label="Rear Camber" value={result.alignment.rearCamber.englishValueAsNumber.toFixed(1)} unit="°" />
        <Pair label="Front Toe" value={result.alignment.frontToe.englishValueAsNumber.toFixed(1)} unit="°" />
        <Pair label="Rear Toe" value={result.alignment.rearToe.englishValueAsNumber.toFixed(1)} unit="°" />
        <Pair label="Caster" value={result.alignment.caster.englishValueAsNumber.toFixed(1)} unit="°" />
      </Group>

      <Group title="Anti-Roll Bars" tag="ARB">
        <Pair label="Front" value={result.swayBars.front.englishValueAsNumber.toFixed(2)} />
        <Pair label="Rear" value={result.swayBars.rear.englishValueAsNumber.toFixed(2)} />
      </Group>

      <Group title="Springs" tag={sUnit.toUpperCase()}>
        <Pair label="Front" value={spring(result.springs.front.englishValueAsNumber).toFixed(sDec)} unit={sUnit} />
        <Pair label="Rear" value={spring(result.springs.rear.englishValueAsNumber).toFixed(sDec)} unit={sUnit} />
        <Pair label="Ride Height" value={result.springs.rideHeight.label} />
      </Group>

      <Group title="Damping" tag="STIFFNESS">
        <Pair label="Front Bump" value={result.damping.frontBump.englishValueAsNumber.toFixed(1)} />
        <Pair label="Rear Bump" value={result.damping.rearBump.englishValueAsNumber.toFixed(1)} />
        <Pair label="Front Rebound" value={result.damping.frontRebound.englishValueAsNumber.toFixed(1)} />
        <Pair label="Rear Rebound" value={result.damping.rearRebound.englishValueAsNumber.toFixed(1)} />
      </Group>

      <Group title="Aero" tag="DOWNFORCE">
        <Pair label="Front" value={result.aero.frontLabel} />
        <Pair label="Rear" value={result.aero.rearLabel} />
        {result.aero.message && (
          <p className="text-[10px] font-mono text-text-dim leading-relaxed col-span-2 pt-1">
            {result.aero.message}
          </p>
        )}
      </Group>

      <Group title="Braking" tag="BRAKES">
        <Pair label="Balance (front)" value={result.brakes.balance.toFixed(0) + '%'} />
        <Pair label="Force" value={result.brakes.force.toFixed(0) + '%'} />
      </Group>

      <Group title="Differential" tag="DIFF">
        <Pair label="Front Accel" value={result.differentials.front.accel.toFixed(0) + '%'} />
        <Pair label="Front Decel" value={result.differentials.front.decel.toFixed(0) + '%'} />
        <Pair label="Rear Accel" value={result.differentials.rear.accel.toFixed(0) + '%'} />
        <Pair label="Rear Decel" value={result.differentials.rear.decel.toFixed(0) + '%'} />
        <Pair label="Center Balance" value={result.differentials.centerSplit.toFixed(0) + '%'} />
      </Group>

      {result.gears && (
        <Group title="Gearing" tag="RATIOS">
          <Pair label="Final Drive" value={result.gears.final.toFixed(2)} />
          {result.gears.ratios.map((r, i) => (
            <Pair key={i} label={ordinal(i + 1) + ' Gear'} value={r.toFixed(2)} />
          ))}
        </Group>
      )}
    </div>
  );
}

function Group({ title, tag, children }: { title: string; tag: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline gap-3">
        <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-dim">{tag}</span>
        <h3 className="text-xs font-medium tracking-wide text-text-muted">{title}</h3>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pl-2 border-l border-border-muted">
        {children}
      </div>
    </section>
  );
}

function Pair({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[11px] text-text-muted truncate">{label}</span>
      <span className="text-sm font-mono text-text tabular-nums shrink-0">
        {value}
        {unit && <span className="text-text-dim text-[0.75em] ml-1">{unit}</span>}
      </span>
    </div>
  );
}

function ordinal(n: number): string {
  const names = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];
  return names[n] ?? `${n}th`;
}
