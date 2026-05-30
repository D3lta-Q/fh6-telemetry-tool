import { useEffect, useRef, useState } from 'react';
import type { TuneResult } from '@shared/tuning';
import {
  springFromLbIn,
  pressureFromPsi,
  SPRING_UNIT_LABELS,
  PRESSURE_UNIT_LABELS,
  Drivetrain,
  TuneType,
} from '@shared/tuning';
import {
  flattenTune,
  analyzeTestLap,
  rideHeightLabel,
  aeroLabel,
  type TuneParam,
  type Suggestion,
  type TestLapResult,
} from '@shared/analysis';
import type { TuningUnits } from '../../store/tuningStore';
import { useTestLapRecorder } from '../../hooks/useTestLapRecorder';

/**
 * Tune Refinement view.
 *
 * Holds its own working copy of the tune (initialised from, and re-syncable to,
 * the calculated tune). Recording a test lap analyses the telemetry and overlays
 * suggested values as a second green dot on each affected slider; the user then
 * accepts or denies the suggestions.
 */
export function RefinementPanel({
  result,
  units,
  tuneType,
  drivetrain,
  onBaseParamsChange,
  loadedParams,
  loadVersion,
}: {
  result: TuneResult;
  units: TuningUnits;
  tuneType: TuneType;
  drivetrain: Drivetrain;
  onBaseParamsChange?: (params: TuneParam[]) => void;
  loadedParams?: TuneParam[];
  loadVersion?: number;
}) {
  // Working copy. Initialised once from the calculated tune; only re-synced when
  // the user presses Reset or a saved tune is loaded.
  const [baseParams, setBaseParams] = useState<TuneParam[]>(() => flattenTune(result));
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [analysis, setAnalysis] = useState<TestLapResult | null>(null);

  const { recording, frameCount, start, stop } = useTestLapRecorder();

  // First time we ever get a valid tune, seed the working copy.
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (!seeded) {
      setBaseParams(flattenTune(result));
      setSeeded(true);
    }
  }, [result, seeded]);

  // When a saved tune is loaded, reset to the loaded params.
  const prevLoadVersion = useRef(loadVersion ?? 0);
  useEffect(() => {
    if (loadVersion !== undefined && loadVersion !== prevLoadVersion.current) {
      prevLoadVersion.current = loadVersion;
      if (loadedParams && loadedParams.length > 0) {
        setBaseParams(loadedParams);
        setSuggestions(null);
        setAnalysis(null);
      }
    }
  }, [loadVersion, loadedParams]);

  // Notify parent whenever the working copy changes.
  useEffect(() => {
    onBaseParamsChange?.(baseParams);
  }, [baseParams, onBaseParamsChange]);

  const suggestionFor = (id: string) => suggestions?.find((s) => s.paramId === id);

  const handleRecordToggle = () => {
    if (!recording) {
      setSuggestions(null);
      setAnalysis(null);
      start();
    } else {
      const packets = stop();
      const res = analyzeTestLap(packets, baseParams, { tuneType, drivetrain });
      setAnalysis(res);
      setSuggestions(res.ok && res.suggestions.length > 0 ? res.suggestions : null);
    }
  };

  const handleAccept = () => {
    if (!suggestions) return;
    setBaseParams((prev) =>
      prev.map((p) => {
        const s = suggestions.find((x) => x.paramId === p.id);
        return s ? { ...p, value: s.to } : p;
      })
    );
    setSuggestions(null);
  };

  const handleDeny = () => setSuggestions(null);

  const handleReset = () => {
    setBaseParams(flattenTune(result));
    setSuggestions(null);
    setAnalysis(null);
  };

  const fmt = (param: TuneParam, value: number) => formatValue(param, value, units);

  // Group params for rendering: section → subSection → rows.
  const sections = groupParams(baseParams);

  return (
    <div className="flex flex-col gap-3">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 sticky top-0 z-10 bg-bg py-1">
        <button
          onClick={handleRecordToggle}
          className={`h-8 px-3 rounded text-[11px] font-mono uppercase tracking-wider border transition-colors ${
            recording
              ? 'border-accent-red/50 bg-accent-red/15 text-accent-red'
              : 'border-border-muted bg-bg-input text-text hover:border-border'
          }`}
        >
          {recording ? `■ Stop & Analyze · ${frameCount}` : '● Record Test Lap'}
        </button>
        <button
          onClick={handleAccept}
          disabled={!suggestions}
          className="h-8 px-3 rounded text-[11px] font-mono uppercase tracking-wider border border-border-muted bg-bg-input text-accent-lime hover:border-accent-lime/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ✓ Accept
        </button>
        <button
          onClick={handleDeny}
          disabled={!suggestions}
          className="h-8 px-3 rounded text-[11px] font-mono uppercase tracking-wider border border-border-muted bg-bg-input text-text-muted hover:border-border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ✕ Deny
        </button>
        <button
          onClick={handleReset}
          className="h-8 px-3 rounded text-[11px] font-mono uppercase tracking-wider border border-border-muted bg-bg-input text-text-dim hover:text-text hover:border-border transition-colors ml-auto"
          title="Re-sync these values with the Calculated Tune"
        >
          ↺ Reset Tuning Values
        </button>
      </div>

      {/* Status / findings */}
      {recording && (
        <div className="px-3 py-2 rounded border border-accent-red/30 bg-accent-red/10">
          <p className="text-[11px] font-mono text-accent-red">
            Recording test lap… drive a representative lap, then press Stop &amp; Analyze.
          </p>
        </div>
      )}
      {!recording && analysis && <AnalysisSummary analysis={analysis} hasSuggestions={!!suggestions} />}

      {/* Parameter rows */}
      {sections.map((section) => (
        <div key={section.name} className="flex flex-col">
          <div className="px-3 py-1.5 border-l-2 border-[#00d4ff] bg-bg-elevated">
            <span className="text-[11px] font-mono font-semibold uppercase tracking-[0.2em] text-[#00d4ff]">
              {section.name}
            </span>
          </div>
          <div className="flex flex-col py-1">
            {section.groups.map((group, gi) => (
              <div key={gi} className="flex flex-col">
                {group.subSection && (
                  <div className="px-3 pt-1 pb-0.5">
                    <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-text-dim">
                      {group.subSection}
                    </span>
                  </div>
                )}
                {group.rows.map((param) => (
                  <Row key={param.id} param={param} suggestion={suggestionFor(param.id)} fmt={fmt} />
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---- rows --------------------------------------------------------------------

function Row({
  param,
  suggestion,
  fmt,
}: {
  param: TuneParam;
  suggestion?: Suggestion;
  fmt: (p: TuneParam, v: number) => string;
}) {
  // Read-only text rows (gear ratios) have no slider.
  if (param.format === 'ratio') {
    return (
      <div className="flex items-center justify-between px-3 py-[3px]">
        <span className="text-[11px] text-text-muted truncate">{param.label}</span>
        <span className="text-sm font-mono text-text tabular-nums ml-4 shrink-0">{param.text}</span>
      </div>
    );
  }

  const basePct = pct(param.value, param.min, param.max);
  const suggPct = suggestion ? pct(suggestion.to, param.min, param.max) : undefined;

  return (
    <div
      className="flex items-center gap-2 px-3 py-[3px]"
      title={suggestion ? suggestion.reason : undefined}
    >
      <span className="text-[11px] text-text-muted w-24 shrink-0 truncate">{param.label}</span>
      <div className="relative flex-1 h-4 flex items-center">
        <div className="absolute inset-x-0 h-px bg-border-muted" />
        <div className="absolute left-0 h-px bg-border" style={{ width: `${basePct}%` }} />
        <div
          className="absolute w-[7px] h-[7px] rounded-full bg-text-muted border border-border"
          style={{ left: `calc(${basePct}% - 3.5px)` }}
        />
        {suggPct != null && (
          <div
            className="absolute w-[8px] h-[8px] rounded-full bg-accent-lime border border-accent-lime shadow-[0_0_4px_rgba(163,230,53,0.6)]"
            style={{ left: `calc(${suggPct}% - 4px)` }}
          />
        )}
      </div>
      <div className="text-sm font-mono tabular-nums text-right w-[7.5rem] shrink-0">
        {suggestion ? (
          <>
            <span className="text-text-dim line-through decoration-text-dim/40">
              {fmt(param, param.value)}
            </span>
            <span className="text-accent-lime ml-1.5">{fmt(param, suggestion.to)}</span>
          </>
        ) : (
          <span className="text-text">{fmt(param, param.value)}</span>
        )}
      </div>
    </div>
  );
}

function AnalysisSummary({
  analysis,
  hasSuggestions,
}: {
  analysis: TestLapResult;
  hasSuggestions: boolean;
}) {
  const { stats } = analysis;
  const excluded =
    stats.excludedCollision + stats.excludedAirborne + stats.excludedOffRoad;
  return (
    <div className="px-3 py-2 rounded border border-border-muted bg-bg-input/40 flex flex-col gap-1.5">
      {!analysis.ok && <p className="text-[11px] font-mono text-accent-red">{analysis.reason}</p>}
      {analysis.findings.map((f, i) => (
        <p key={i} className="text-[11px] text-text-muted leading-relaxed">
          • {f}
        </p>
      ))}
      <p className="text-[10px] font-mono text-text-dim pt-1">
        {stats.validFrames}/{stats.totalFrames} frames analysed · {stats.corneringFrames} cornering ·{' '}
        {stats.brakingFrames} braking
        {excluded > 0 &&
          ` · excluded ${stats.excludedCollision} collision / ${stats.excludedAirborne} airborne / ${stats.excludedOffRoad} off-road`}
      </p>
      {hasSuggestions && (
        <p className="text-[10px] font-mono text-accent-lime pt-0.5">
          Suggested changes shown in green — Accept to apply, Deny to discard.
        </p>
      )}
    </div>
  );
}

// ---- helpers -----------------------------------------------------------------

function pct(v: number, min: number, max: number): number {
  if (max === min) return 50;
  return Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100));
}

function formatValue(param: TuneParam, value: number, units: TuningUnits): string {
  switch (param.format) {
    case 'pressure': {
      const v = pressureFromPsi(value, units.pressure);
      return `${v.toFixed(units.pressure === 'bar' ? 2 : 1)} ${PRESSURE_UNIT_LABELS[units.pressure]}`;
    }
    case 'spring': {
      const v = springFromLbIn(value, units.spring);
      return `${v.toFixed(units.spring === 'lbin' ? 0 : 2)} ${SPRING_UNIT_LABELS[units.spring]}`;
    }
    case 'deg':
      return `${value.toFixed(1)}°`;
    case 'pct':
      return `${value.toFixed(0)}%`;
    case 'rideHeight':
      return rideHeightLabel(value);
    case 'aero':
      return aeroLabel(value);
    case 'ratio':
      return value.toFixed(2);
    default:
      return value.toFixed(param.decimals);
  }
}

interface Group {
  subSection?: string;
  rows: TuneParam[];
}
interface SectionGroup {
  name: string;
  groups: Group[];
}

/** Group the flat param list into sections and sub-sections, preserving order. */
function groupParams(params: TuneParam[]): SectionGroup[] {
  const sections: SectionGroup[] = [];
  for (const p of params) {
    let section = sections.find((s) => s.name === p.section);
    if (!section) {
      section = { name: p.section, groups: [] };
      sections.push(section);
    }
    let group = section.groups[section.groups.length - 1];
    if (!group || group.subSection !== p.subSection) {
      group = { subSection: p.subSection, rows: [] };
      section.groups.push(group);
    }
    group.rows.push(p);
  }
  return sections;
}
