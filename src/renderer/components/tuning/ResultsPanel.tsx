import type { TuneResult } from '@shared/tuning';
import {
  springFromLbIn,
  pressureFromPsi,
  SPRING_UNIT_LABELS,
  PRESSURE_UNIT_LABELS,
} from '@shared/tuning';
import type { TuningUnits } from '../../store/tuningStore';

interface RangeLike {
  englishValueAsNumber: number;
  minEnglishValue: number;
  maxEnglishValue: number;
}

function sliderPct(v: RangeLike): number {
  const range = v.maxEnglishValue - v.minEnglishValue;
  if (range === 0) return 50;
  return Math.min(100, Math.max(0, ((v.englishValueAsNumber - v.minEnglishValue) / range) * 100));
}

export function ResultsPanel({ result, units }: { result: TuneResult; units: TuningUnits }) {
  const psi = (v: number) => pressureFromPsi(v, units.pressure);
  const spring = (v: number) => springFromLbIn(v, units.spring);
  const pUnit = PRESSURE_UNIT_LABELS[units.pressure];
  const sUnit = SPRING_UNIT_LABELS[units.spring];
  const pDec = units.pressure === 'bar' ? 2 : 1;
  const sDec = units.spring === 'lbin' ? 0 : 2;

  return (
    <div className="flex flex-col gap-2">

      {/* TIRES */}
      <Section label="Tires">
        <SubSection label="Tire Pressure">
          <ValueRow label="Front" rv={result.tires.front}
            display={psi(result.tires.front.englishValueAsNumber).toFixed(pDec)} unit={pUnit} />
          <ValueRow label="Rear" rv={result.tires.rear}
            display={psi(result.tires.rear.englishValueAsNumber).toFixed(pDec)} unit={pUnit} />
        </SubSection>
      </Section>

      {/* GEARING */}
      {result.gears && (
        <Section label="Gearing">
          <SubSection label="Forward Gears">
            <TextRow label="Final Drive" value={result.gears.final.toFixed(2)} />
            {result.gears.ratios.map((r, i) => (
              <TextRow key={i} label={ordinal(i + 1) + ' Gear'} value={r.toFixed(2)} />
            ))}
          </SubSection>
        </Section>
      )}

      {/* ALIGNMENT */}
      <Section label="Alignment">
        <SubSection label="Camber">
          <ValueRow label="Front" rv={result.alignment.frontCamber}
            display={result.alignment.frontCamber.englishValueAsNumber.toFixed(1)} unit="°" />
          <ValueRow label="Rear" rv={result.alignment.rearCamber}
            display={result.alignment.rearCamber.englishValueAsNumber.toFixed(1)} unit="°" />
        </SubSection>
        <SubSection label="Toe">
          <ValueRow label="Front" rv={result.alignment.frontToe}
            display={result.alignment.frontToe.englishValueAsNumber.toFixed(1)} unit="°" />
          <ValueRow label="Rear" rv={result.alignment.rearToe}
            display={result.alignment.rearToe.englishValueAsNumber.toFixed(1)} unit="°" />
        </SubSection>
        <SubSection label="Front Caster">
          <ValueRow label="Angle" rv={result.alignment.caster}
            display={result.alignment.caster.englishValueAsNumber.toFixed(1)} unit="°" />
        </SubSection>
      </Section>

      {/* ANTIROLL BARS */}
      <Section label="Antiroll Bars">
        <ValueRow label="Front" rv={result.swayBars.front}
          display={result.swayBars.front.englishValueAsNumber.toFixed(2)} />
        <ValueRow label="Rear" rv={result.swayBars.rear}
          display={result.swayBars.rear.englishValueAsNumber.toFixed(2)} />
      </Section>

      {/* SPRINGS */}
      <Section label="Springs">
        <SubSection label="Springs">
          <ValueRow label="Front" rv={result.springs.front}
            display={spring(result.springs.front.englishValueAsNumber).toFixed(sDec)} unit={sUnit} />
          <ValueRow label="Rear" rv={result.springs.rear}
            display={spring(result.springs.rear.englishValueAsNumber).toFixed(sDec)} unit={sUnit} />
        </SubSection>
        <SubSection label="Ride Height">
          <TextRow label="Front" value={result.springs.rideHeight.label} />
          <TextRow label="Rear" value={result.springs.rideHeight.label} />
        </SubSection>
      </Section>

      {/* DAMPING */}
      <Section label="Damping">
        <SubSection label="Rebound Stiffness">
          <ValueRow label="Front" rv={result.damping.frontRebound}
            display={result.damping.frontRebound.englishValueAsNumber.toFixed(1)} />
          <ValueRow label="Rear" rv={result.damping.rearRebound}
            display={result.damping.rearRebound.englishValueAsNumber.toFixed(1)} />
        </SubSection>
        <SubSection label="Bump Stiffness">
          <ValueRow label="Front" rv={result.damping.frontBump}
            display={result.damping.frontBump.englishValueAsNumber.toFixed(1)} />
          <ValueRow label="Rear" rv={result.damping.rearBump}
            display={result.damping.rearBump.englishValueAsNumber.toFixed(1)} />
        </SubSection>
      </Section>

      {/* AERO */}
      <Section label="Aero">
        <SubSection label="Downforce">
          <PctRow label="Front" pct={result.aero.frontValue} display={result.aero.frontLabel} />
          <PctRow label="Rear" pct={result.aero.rearValue} display={result.aero.rearLabel} />
        </SubSection>
        {result.aero.message && (
          <p className="text-[10px] font-mono text-text-dim leading-relaxed px-3 pb-1">
            {result.aero.message}
          </p>
        )}
      </Section>

      {/* BRAKES */}
      <Section label="Brakes">
        <PctRow label="Braking Balance" pct={result.brakes.balance}
          display={result.brakes.balance.toFixed(0) + '%'} />
        <PctRow label="Braking Pressure" pct={result.brakes.force}
          display={result.brakes.force.toFixed(0) + '%'} />
      </Section>

      {/* DIFFERENTIAL */}
      <Section label="Differential">
        <SubSection label="Front">
          <PctRow label="Acceleration" pct={result.differentials.front.accel}
            display={result.differentials.front.accel.toFixed(0) + '%'} />
          <PctRow label="Deceleration" pct={result.differentials.front.decel}
            display={result.differentials.front.decel.toFixed(0) + '%'} />
        </SubSection>
        <SubSection label="Rear">
          <PctRow label="Acceleration" pct={result.differentials.rear.accel}
            display={result.differentials.rear.accel.toFixed(0) + '%'} />
          <PctRow label="Deceleration" pct={result.differentials.rear.decel}
            display={result.differentials.rear.decel.toFixed(0) + '%'} />
        </SubSection>
        <SubSection label="Center">
          <PctRow label="Balance" pct={result.differentials.centerSplit}
            display={result.differentials.centerSplit.toFixed(0) + '%'} />
        </SubSection>
      </Section>

    </div>
  );
}

// ---- layout primitives -------------------------------------------------------

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <div className="px-3 py-1.5 border-l-2 border-[#00d4ff] bg-bg-elevated">
        <span className="text-[11px] font-mono font-semibold uppercase tracking-[0.2em] text-[#00d4ff]">
          {label}
        </span>
      </div>
      <div className="flex flex-col py-1">{children}</div>
    </div>
  );
}

function SubSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <div className="px-3 pt-1 pb-0.5">
        <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-text-dim">
          {label}
        </span>
      </div>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

function SliderTrack({ pct }: { pct: number }) {
  return (
    <div className="relative flex-1 h-4 flex items-center">
      <div className="absolute inset-x-0 h-px bg-border-muted" />
      <div className="absolute left-0 h-px bg-border" style={{ width: `${pct}%` }} />
      <div
        className="absolute w-[7px] h-[7px] rounded-full bg-text-muted border border-border"
        style={{ left: `calc(${pct}% - 3.5px)` }}
      />
    </div>
  );
}

function ValueRow({
  label,
  rv,
  display,
  unit,
}: {
  label: string;
  rv: RangeLike;
  display: string;
  unit?: string;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-[3px]">
      <span className="text-[11px] text-text-muted w-24 shrink-0 truncate">{label}</span>
      <SliderTrack pct={sliderPct(rv)} />
      <ValueCell display={display} unit={unit} />
    </div>
  );
}

function PctRow({
  label,
  pct,
  display,
  unit,
}: {
  label: string;
  pct: number;
  display: string;
  unit?: string;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-[3px]">
      <span className="text-[11px] text-text-muted w-24 shrink-0 truncate">{label}</span>
      <SliderTrack pct={Math.min(100, Math.max(0, pct))} />
      <ValueCell display={display} unit={unit} />
    </div>
  );
}

function TextRow({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-[3px]">
      <span className="text-[11px] text-text-muted truncate">{label}</span>
      <span className="text-sm font-mono text-text tabular-nums ml-4 shrink-0">
        {value}
        {unit && <span className="text-text-dim text-[0.75em] ml-1">{unit}</span>}
      </span>
    </div>
  );
}

function ValueCell({ display, unit }: { display: string; unit?: string }) {
  return (
    <div className="text-sm font-mono text-text tabular-nums text-right w-[4.5rem] shrink-0">
      {display}
      {unit && <span className="text-text-dim text-[0.75em] ml-1">{unit}</span>}
    </div>
  );
}

function ordinal(n: number): string {
  const names = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];
  return names[n] ?? `${n}th`;
}
