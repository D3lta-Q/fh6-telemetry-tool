import { useMemo, useState } from 'react';
import {
  calculateTune,
  carName,
  SURFACES,
  TUNE_TYPE_LABELS,
  DRIVETRAIN_LABELS,
  Drivetrain,
  TuneType,
  EngineLocation,
  kgToLb,
  lbToKg,
  WEIGHT_UNIT_LABELS,
  SPRING_UNIT_LABELS,
  PRESSURE_UNIT_LABELS,
  SPEED_UNIT_LABELS,
  KMH_PER_MPH,
  type Car,
  type CarGeometry,
  type TuneRequest,
  type GearingRequest,
} from '@shared/tuning';
import { SegmentedControl } from '../ui';
import { useTuningStore } from '../../store/tuningStore';
import { CarPicker } from './CarPicker';
import { ResultsPanel } from './ResultsPanel';
import { RefinementPanel } from './RefinementPanel';

interface ManualGeometry {
  make: string;
  model: string;
  year: string;
  length: string;
  width: string;
  height: string;
  wheelbase: string;
  frontTrack: string;
  rearTrack: string;
  engineLocation: EngineLocation;
}

const EMPTY_MANUAL: ManualGeometry = {
  make: '',
  model: '',
  year: '',
  length: '',
  width: '',
  height: '',
  wheelbase: '',
  frontTrack: '',
  rearTrack: '',
  engineLocation: EngineLocation.Front,
};

const EMPTY_GEARING = {
  redline: '7000',
  maxTorqueRevs: '5000',
  maxTorque: '400',
  numGears: '6',
  tireWidth: '255',
  tireRatio: '40',
  wheelDiameter: '19',
  topSpeed: '250',
};

export function TuningTab() {
  const units = useTuningStore((s) => s.units);
  const setUnit = useTuningStore((s) => s.setUnit);
  const addUserCar = useTuningStore((s) => s.addUserCar);

  const [selectedCar, setSelectedCar] = useState<Car | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manual, setManual] = useState<ManualGeometry>(EMPTY_MANUAL);

  // Canonical internal values (kg, %, PI). Display converts as needed.
  const [weightKg, setWeightKg] = useState(1500);
  const [percentFront, setPercentFront] = useState(50);
  const [performanceIndex, setPerformanceIndex] = useState(800);
  const [drivetrain, setDrivetrain] = useState<Drivetrain>(Drivetrain.RWD);
  const [surfaceId, setSurfaceId] = useState(SURFACES[0].id);
  const [tuneType, setTuneType] = useState<TuneType>(TuneType.Dry);

  const [gearingEnabled, setGearingEnabled] = useState(false);
  const [gearing, setGearing] = useState({ ...EMPTY_GEARING });

  const [resultsView, setResultsView] = useState<'calculated' | 'refinement'>('calculated');

  const onSelectCar = (car: Car) => {
    setSelectedCar(car);
    setManualMode(false);
    setWeightKg(Math.round(car.weightKg));
    setPerformanceIndex(car.performanceIndex);
  };

  const onCustom = () => {
    setSelectedCar(null);
    setManualMode(true);
    setManual(EMPTY_MANUAL);
  };

  // Effective geometry (from DB car or manual entry).
  const geometry: CarGeometry | null = useMemo(() => {
    if (selectedCar && !manualMode) return selectedCar.geometry;
    if (manualMode) {
      const g: CarGeometry = {
        length: parseFloat(manual.length),
        width: parseFloat(manual.width),
        height: parseFloat(manual.height),
        wheelbase: parseFloat(manual.wheelbase),
        frontTrack: parseFloat(manual.frontTrack),
        rearTrack: parseFloat(manual.rearTrack),
        engineLocation: manual.engineLocation,
      };
      const ok = [g.length, g.width, g.height, g.wheelbase, g.frontTrack, g.rearTrack].every(
        (v) => Number.isFinite(v) && v > 0
      );
      return ok ? g : null;
    }
    return null;
  }, [selectedCar, manualMode, manual]);

  const surface = SURFACES.find((s) => s.id === surfaceId) ?? SURFACES[0];

  const result = useMemo(() => {
    if (!geometry) return null;
    if (!(weightKg > 0 && performanceIndex > 0 && percentFront > 0)) return null;

    let gearingReq: GearingRequest | undefined;
    if (gearingEnabled) {
      const topSpeedKmh =
        units.speed === 'mph' ? parseFloat(gearing.topSpeed) * KMH_PER_MPH : parseFloat(gearing.topSpeed);
      gearingReq = {
        redline: parseFloat(gearing.redline),
        maxTorqueRevs: parseFloat(gearing.maxTorqueRevs),
        maxTorque: parseFloat(gearing.maxTorque), // N·m
        tireWidth: parseFloat(gearing.tireWidth),
        tireRatio: parseFloat(gearing.tireRatio),
        wheelDiameter: parseFloat(gearing.wheelDiameter),
        numberOfGears: parseInt(gearing.numGears, 10),
        topSpeed: topSpeedKmh,
      };
      const valid = Object.values(gearingReq).every((v) => Number.isFinite(v) && v > 0);
      if (!valid) gearingReq = undefined;
    }

    const req: TuneRequest = {
      weightKg,
      percentFront,
      performanceIndex,
      drivetrain,
      tuneType,
      surface,
      geometry,
      gearing: gearingReq,
    };
    try {
      return calculateTune(req);
    } catch {
      return null;
    }
  }, [
    geometry,
    weightKg,
    percentFront,
    performanceIndex,
    drivetrain,
    tuneType,
    surface,
    gearingEnabled,
    gearing,
    units.speed,
  ]);

  const handleAddToDatabase = () => {
    if (!geometry) return;
    const car: Car = {
      id: Date.now(),
      division: 'Custom',
      year: parseInt(manual.year, 10) || new Date().getFullYear(),
      make: manual.make.trim() || 'Custom',
      model: manual.model.trim() || 'Vehicle',
      carClass: null,
      performanceIndex,
      weightKg,
      geometry,
      userAdded: true,
    };
    addUserCar(car);
    setSelectedCar(car);
    setManualMode(false);
  };

  const weightDisplay = units.weight === 'lb' ? kgToLb(weightKg) : weightKg;
  const onWeightChange = (v: number) => setWeightKg(units.weight === 'lb' ? lbToKg(v) : v);

  return (
    <div className="flex-1 min-h-0 flex overflow-hidden">
      {/* Inputs */}
      <div className="w-[440px] shrink-0 overflow-y-auto border-r border-border px-5 py-4 flex flex-col gap-6">
        <Section title="Vehicle" tag="CAR">
          <CarPicker selected={selectedCar} onSelect={onSelectCar} onCustom={onCustom} />
          {selectedCar && !manualMode && (
            <p className="text-[10px] font-mono text-text-dim">
              {selectedCar.division} · stock PI {selectedCar.performanceIndex} ·{' '}
              {Math.round(selectedCar.weightKg)} kg
            </p>
          )}
          {manualMode && (
            <ManualEntry
              manual={manual}
              setManual={setManual}
              onAdd={handleAddToDatabase}
              canAdd={!!geometry}
            />
          )}
        </Section>

        <Section title="Setup" tag="PARAMS">
          <Field label="Weight">
            <NumberWithUnit
              value={weightDisplay}
              onChange={onWeightChange}
              decimals={units.weight === 'lb' ? 0 : 0}
              unit={
                <SegmentedControl
                  value={units.weight}
                  options={[
                    { value: 'kg', label: WEIGHT_UNIT_LABELS.kg },
                    { value: 'lb', label: WEIGHT_UNIT_LABELS.lb },
                  ]}
                  onChange={(v) => setUnit('weight', v)}
                />
              }
            />
          </Field>
          <Field label="Front weight %">
            <NumberInput value={percentFront} onChange={setPercentFront} min={1} max={99} />
          </Field>
          <Field label="Performance Index">
            <NumberInput value={performanceIndex} onChange={setPerformanceIndex} min={100} max={999} />
          </Field>
          <Field label="Drive type">
            <SegmentedControl
              value={String(drivetrain)}
              options={DRIVETRAIN_LABELS.map((d) => ({ value: String(d.value), label: d.label }))}
              onChange={(v) => setDrivetrain(Number(v) as Drivetrain)}
            />
          </Field>
          <Field label="Driving surface">
            <SegmentedControl
              value={surfaceId}
              options={SURFACES.map((s) => ({ value: s.id, label: s.name.split(' ')[0] }))}
              onChange={setSurfaceId}
            />
          </Field>
          <Field label="Tune type">
            <Select
              value={String(tuneType)}
              options={TUNE_TYPE_LABELS.map((t) => ({ value: String(t.value), label: t.label }))}
              onChange={(v) => setTuneType(Number(v) as TuneType)}
            />
          </Field>
        </Section>

        <Section title="Gearing" tag="OPTIONAL">
          <Toggle
            label="Include gearing tune"
            value={gearingEnabled}
            onChange={setGearingEnabled}
          />
          {gearingEnabled && (
            <div className="flex flex-col gap-3">
              <Field label="Redline (RPM)">
                <TextNum value={gearing.redline} onChange={(v) => setGearing({ ...gearing, redline: v })} />
              </Field>
              <Field label="Max torque RPM">
                <TextNum value={gearing.maxTorqueRevs} onChange={(v) => setGearing({ ...gearing, maxTorqueRevs: v })} />
              </Field>
              <Field label="Max torque (N·m)">
                <TextNum value={gearing.maxTorque} onChange={(v) => setGearing({ ...gearing, maxTorque: v })} />
              </Field>
              <Field label="Number of gears">
                <TextNum value={gearing.numGears} onChange={(v) => setGearing({ ...gearing, numGears: v })} />
              </Field>
              <Field label="Rear tire size" hint="Width / Ratio / Diameter — e.g. 285 / 35 / 19">
                <div className="flex items-center gap-1.5">
                  <TireNum value={gearing.tireWidth} onChange={(v) => setGearing({ ...gearing, tireWidth: v })} />
                  <span className="text-text-dim text-xs">/</span>
                  <TireNum value={gearing.tireRatio} onChange={(v) => setGearing({ ...gearing, tireRatio: v })} />
                  <span className="text-text-dim text-xs">R</span>
                  <TireNum value={gearing.wheelDiameter} onChange={(v) => setGearing({ ...gearing, wheelDiameter: v })} />
                </div>
              </Field>
              <Field label="Top speed">
                <div className="flex items-center gap-2">
                  <TextNum value={gearing.topSpeed} onChange={(v) => setGearing({ ...gearing, topSpeed: v })} />
                  <SegmentedControl
                    value={units.speed}
                    options={[
                      { value: 'kmh', label: SPEED_UNIT_LABELS.kmh },
                      { value: 'mph', label: SPEED_UNIT_LABELS.mph },
                    ]}
                    onChange={(v) => setUnit('speed', v)}
                  />
                </div>
              </Field>
            </div>
          )}
        </Section>

        <Section title="Output units" tag="DISPLAY">
          <Field label="Springs">
            <SegmentedControl
              value={units.spring}
              options={[
                { value: 'lbin', label: SPRING_UNIT_LABELS.lbin },
                { value: 'nmm', label: SPRING_UNIT_LABELS.nmm },
                { value: 'kgfmm', label: SPRING_UNIT_LABELS.kgfmm },
              ]}
              onChange={(v) => setUnit('spring', v)}
            />
          </Field>
          <Field label="Tire pressure">
            <SegmentedControl
              value={units.pressure}
              options={[
                { value: 'psi', label: PRESSURE_UNIT_LABELS.psi },
                { value: 'bar', label: PRESSURE_UNIT_LABELS.bar },
              ]}
              onChange={(v) => setUnit('pressure', v)}
            />
          </Field>
        </Section>
      </div>

      {/* Results */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
        {result ? (
          <>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-sm font-medium text-text">
                {selectedCar ? carName(selectedCar) : 'Custom Tune'}
              </h2>
              <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-dim">
                {surface.name} · {TUNE_TYPE_LABELS.find((t) => t.value === tuneType)?.label}
              </span>
            </div>

            <div className="mb-4">
              <SegmentedControl
                value={resultsView}
                options={[
                  { value: 'calculated', label: 'Calculated Tune' },
                  { value: 'refinement', label: 'Tune Refinement' },
                ]}
                onChange={(v) => setResultsView(v as 'calculated' | 'refinement')}
              />
            </div>

            {/* Both mount so the refinement working copy survives view switches. */}
            <div className={resultsView === 'calculated' ? '' : 'hidden'}>
              <ResultsPanel result={result} units={units} />
            </div>
            <div className={resultsView === 'refinement' ? '' : 'hidden'}>
              <RefinementPanel
                result={result}
                units={units}
                tuneType={tuneType}
                drivetrain={drivetrain}
              />
            </div>
          </>
        ) : (
          <div className="h-full flex items-center justify-center">
            <p className="text-xs font-mono text-text-dim text-center max-w-xs leading-relaxed">
              {manualMode
                ? 'Enter all vehicle dimensions to calculate a tune.'
                : 'Select a vehicle to calculate a recommended tune.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Manual entry ----------------------------------------------------------

function ManualEntry({
  manual,
  setManual,
  onAdd,
  canAdd,
}: {
  manual: ManualGeometry;
  setManual: (m: ManualGeometry) => void;
  onAdd: () => void;
  canAdd: boolean;
}) {
  const set = (k: keyof ManualGeometry, v: string) => setManual({ ...manual, [k]: v });
  return (
    <div className="flex flex-col gap-3 mt-1 p-3 rounded border border-border-muted bg-bg-input/50">
      <div className="grid grid-cols-3 gap-2">
        <MiniField label="Year"><MiniInput value={manual.year} onChange={(v) => set('year', v)} /></MiniField>
        <div className="col-span-2 grid grid-cols-2 gap-2">
          <MiniField label="Make"><MiniInput value={manual.make} onChange={(v) => set('make', v)} text /></MiniField>
          <MiniField label="Model"><MiniInput value={manual.model} onChange={(v) => set('model', v)} text /></MiniField>
        </div>
      </div>
      <p className="text-[10px] font-mono text-text-dim">Dimensions in metres.</p>
      <div className="grid grid-cols-3 gap-2">
        <MiniField label="Length"><MiniInput value={manual.length} onChange={(v) => set('length', v)} /></MiniField>
        <MiniField label="Width"><MiniInput value={manual.width} onChange={(v) => set('width', v)} /></MiniField>
        <MiniField label="Height"><MiniInput value={manual.height} onChange={(v) => set('height', v)} /></MiniField>
        <MiniField label="Wheelbase"><MiniInput value={manual.wheelbase} onChange={(v) => set('wheelbase', v)} /></MiniField>
        <MiniField label="Front trk"><MiniInput value={manual.frontTrack} onChange={(v) => set('frontTrack', v)} /></MiniField>
        <MiniField label="Rear trk"><MiniInput value={manual.rearTrack} onChange={(v) => set('rearTrack', v)} /></MiniField>
      </div>
      <MiniField label="Engine location">
        <SegmentedControl
          value={manual.engineLocation}
          options={[
            { value: EngineLocation.Front, label: 'Front' },
            { value: EngineLocation.Mid, label: 'Mid' },
            { value: EngineLocation.Rear, label: 'Rear' },
          ]}
          onChange={(v) => set('engineLocation', v)}
        />
      </MiniField>
      <button
        onClick={onAdd}
        disabled={!canAdd}
        className="self-start h-7 px-3 rounded border border-border-muted bg-bg-input text-[11px] font-mono uppercase tracking-wider text-accent-lime hover:border-accent-lime/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Add to database
      </button>
    </div>
  );
}

// ---- Layout primitives -----------------------------------------------------

function Section({ title, tag, children }: { title: string; tag: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline gap-3">
        <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-dim">{tag}</span>
        <h3 className="text-xs font-medium tracking-wide text-text-muted">{title}</h3>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] text-text-muted">{label}</label>
      {children}
      {hint && <span className="text-[10px] font-mono text-text-dim">{hint}</span>}
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  min,
  max,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <input
      type="number"
      min={min}
      max={max}
      value={value}
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        if (Number.isFinite(v)) onChange(v);
      }}
      className="w-28 h-8 px-2 rounded border border-border-muted bg-bg-input font-mono text-sm text-text focus:outline-none focus:border-border-accent"
    />
  );
}

function NumberWithUnit({
  value,
  onChange,
  decimals,
  unit,
}: {
  value: number;
  onChange: (v: number) => void;
  decimals: number;
  unit: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={Number(value.toFixed(decimals))}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
        className="w-28 h-8 px-2 rounded border border-border-muted bg-bg-input font-mono text-sm text-text focus:outline-none focus:border-border-accent"
      />
      {unit}
    </div>
  );
}

function TextNum({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-28 h-8 px-2 rounded border border-border-muted bg-bg-input font-mono text-sm text-text focus:outline-none focus:border-border-accent"
    />
  );
}

function TireNum({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-16 h-8 px-2 rounded border border-border-muted bg-bg-input font-mono text-sm text-text text-center focus:outline-none focus:border-border-accent"
    />
  );
}

function Select({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 px-2 rounded border border-border-muted bg-bg-input font-mono text-sm text-text focus:outline-none focus:border-border-accent"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)} className="flex items-center justify-between gap-3 text-left group">
      <span className="text-[11px] text-text-muted group-hover:text-text transition-colors">{label}</span>
      <span
        className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border transition-colors ${
          value ? 'bg-accent-lime/20 border-accent-lime/40' : 'bg-bg-input border-border-muted'
        }`}
      >
        <span
          className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all ${
            value ? 'left-[18px] bg-accent-lime' : 'left-0.5 bg-text-dim'
          }`}
        />
      </span>
    </button>
  );
}

function MiniField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[9px] font-mono uppercase tracking-wider text-text-dim">{label}</label>
      {children}
    </div>
  );
}

function MiniInput({ value, onChange, text }: { value: string; onChange: (v: string) => void; text?: boolean }) {
  return (
    <input
      type={text ? 'text' : 'number'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-7 px-2 rounded border border-border-muted bg-bg-input font-mono text-xs text-text focus:outline-none focus:border-border-accent"
    />
  );
}
