import { Suspense, useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, Line, Html } from '@react-three/drei';
import * as THREE from 'three';
import type { TelemetryData } from '@shared/telemetry';
import type { TrackFrame } from '@shared/track';
import type { TuneType } from '@shared/tuning';
import {
  deriveFrames,
  segmentCorners,
  type Frame,
  type Corner,
} from '@shared/analysis/features';
import {
  isOffRoad,
  isAirborne,
  isCollisionImpulse,
  isHandbrake,
} from '@shared/analysis/frameFlags';

// ---- Colour constants (same palette as the rolled-back Track tab overlay) -------

const OVERLAY_COLORS = {
  offRoad:   '#8B4513',  // brown
  airborne:  '#87CEEB',  // light blue
  handbrake: '#C084FC',  // light purple
  collision: '#ff3c1c',  // red
} as const;

const CORNER_COLORS = {
  mid:  '#22C55E',  // green
  exit: '#EAB308',  // yellow
} as const;

const LAP_PATH_COLORS = ['#00d4ff', '#a3e635', '#f97316', '#e879f9', '#34d399'];

// ---- Overlay visibility ----------------------------------------------------

type OverlayKey = 'offRoad' | 'airborne' | 'handbrake' | 'collision' | 'mid' | 'exit';

interface OverlayVisibility {
  offRoad: boolean;
  airborne: boolean;
  handbrake: boolean;
  collision: boolean;
  mid: boolean;
  exit: boolean;
}

const ALL_VISIBLE: OverlayVisibility = {
  offRoad: true, airborne: true, handbrake: true,
  collision: true, mid: true, exit: true,
};

// ---- Data conversion -------------------------------------------------------

function packetsToFrames(
  lp: TelemetryData[],
  origin: { x: number; y: number; z: number },
): TrackFrame[] {
  return lp.map((d) => ({
    t: d.receivedAt,
    x: d.positionX - origin.x,
    y: d.positionY - origin.y,
    z: -(d.positionZ - origin.z),
    yaw: d.yaw,
    pitch: d.pitch,
    roll: d.roll,
    speed: d.speed,
    grip: (d.tireCombinedSlipFrontLeft + d.tireCombinedSlipFrontRight +
           d.tireCombinedSlipRearLeft  + d.tireCombinedSlipRearRight) / 4,
    throttle: d.accel  / 255,
    brake:    d.brake  / 255,
    rumble: false,
    puddle: false,
    offRoad:   isOffRoad(d),
    airborne:  isAirborne(d),
    collision: isCollisionImpulse(d),
    handbrake: isHandbrake(d),
    racePos:          d.racePosition,
    lapNumber:        d.lapNumber,
    currentLap:       d.currentLap,
    bestLap:          d.bestLap,
    lastLap:          d.lastLap,
    currentRaceTime:  d.currentRaceTime,
  }));
}

/** Split a flat packet array into per-lap groups on lapNumber transitions. */
function splitByLap(packets: TelemetryData[]): TelemetryData[][] {
  if (packets.length === 0) return [];
  const groups: TelemetryData[][] = [[]];
  let cur = packets[0].lapNumber;
  for (const p of packets) {
    if (p.lapNumber !== cur) { cur = p.lapNumber; groups.push([]); }
    groups[groups.length - 1].push(p);
  }
  return groups.filter((g) => g.length > 60);
}

// ---- Per-lap pre-computed data ---------------------------------------------

interface LapData {
  index: number;
  lapNumber: number;
  frames: TrackFrame[];
  /** derivedFrames[i].cornerId / .phase match frames[i] (1:1 with packets) */
  derivedFrames: Frame[];
  corners: Corner[];
}

function buildLapData(
  packets: TelemetryData[],
  tuneType: TuneType,
): LapData[] {
  if (packets.length === 0) return [];

  const origin = { x: packets[0].positionX, y: packets[0].positionY, z: packets[0].positionZ };
  const looseTune = (tuneType as number) >= 4; // Rally=4, Truck=5, Buggy=6

  return splitByLap(packets).map((lp, i) => {
    const frames        = packetsToFrames(lp, origin);
    const derivedFrames = deriveFrames(lp, looseTune);
    const corners       = segmentCorners(derivedFrames);
    return { index: i, lapNumber: lp[0].lapNumber, frames, derivedFrames, corners };
  });
}

// ---- Segment-point helpers -------------------------------------------------

type Pt3 = [number, number, number];

function buildFlagSegments(frames: TrackFrame[], field: keyof TrackFrame, yOff: number): Pt3[] {
  const pts: Pt3[] = [];
  for (let i = 1; i < frames.length; i++) {
    const p = frames[i - 1], c = frames[i];
    if (p[field] && c[field]) {
      pts.push([p.x, p.y + yOff, p.z], [c.x, c.y + yOff, c.z]);
    }
  }
  return pts;
}

function buildPhaseSegments(
  frames: TrackFrame[],
  derived: Frame[],
  phase: 'mid' | 'exit',
  yOff: number,
): Pt3[] {
  const pts: Pt3[] = [];
  for (let i = 1; i < frames.length; i++) {
    const a = derived[i - 1];
    const b = derived[i];
    // Stay within a single corner; include the boundary segment so adjacent
    // phases (mid → exit) meet cleanly instead of leaving a one-frame gap.
    if (!a || !b || a.cornerId < 0 || a.cornerId !== b.cornerId) continue;
    if (a.phase === phase || b.phase === phase) {
      const p = frames[i - 1], c = frames[i];
      pts.push([p.x, p.y + yOff, p.z], [c.x, c.y + yOff, c.z]);
    }
  }
  return pts;
}

// ---- 3D scene sub-components -----------------------------------------------

function LapLayer({
  lap, color, lapStart, playbackIdx, visibility,
}: {
  lap: LapData;
  color: string;
  lapStart: number;
  playbackIdx: number | null;
  visibility: OverlayVisibility;
}) {
  // null = show all frames; otherwise slice to lap-relative position
  const localMax = playbackIdx === null
    ? lap.frames.length - 1
    : playbackIdx - lapStart;

  const visFrames  = useMemo(
    () => localMax < 0 ? [] : lap.frames.slice(0, localMax + 1),
    [lap.frames, localMax],
  );
  const visDerived = useMemo(
    () => localMax < 0 ? [] : lap.derivedFrames.slice(0, localMax + 1),
    [lap.derivedFrames, localMax],
  );
  const visCorners = useMemo(
    () => lap.corners.filter((c) => c.apex <= (localMax < 0 ? -1 : localMax)),
    [lap.corners, localMax],
  );

  const pathPts      = useMemo(() => visFrames.map((f): Pt3 => [f.x, f.y + 0.1, f.z]), [visFrames]);
  const offRoadPts   = useMemo(() => buildFlagSegments(visFrames, 'offRoad',   0.30), [visFrames]);
  const airbornePts  = useMemo(() => buildFlagSegments(visFrames, 'airborne',  0.45), [visFrames]);
  const handbrakePts = useMemo(() => buildFlagSegments(visFrames, 'handbrake', 0.20), [visFrames]);
  const midPts       = useMemo(() => buildPhaseSegments(visFrames, visDerived, 'mid',  0.65), [visFrames, visDerived]);
  const exitPts      = useMemo(() => buildPhaseSegments(visFrames, visDerived, 'exit', 0.65), [visFrames, visDerived]);

  // Collision points (imperative for per-frame dots)
  const colGeo = useMemo(() => new THREE.BufferGeometry(), []);
  const colMat = useMemo(
    () => new THREE.PointsMaterial({ color: OVERLAY_COLORS.collision, size: 10, sizeAttenuation: false }),
    [],
  );
  const colPts = useMemo(() => {
    const obj = new THREE.Points(colGeo, colMat);
    obj.frustumCulled = false;
    return obj;
  }, [colGeo, colMat]);
  useEffect(() => {
    const pos: number[] = [];
    for (const f of visFrames) if (f.collision) pos.push(f.x, f.y + 0.6, f.z);
    colGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  }, [visFrames, colGeo]);
  useEffect(() => () => { colGeo.dispose(); colMat.dispose(); }, [colGeo, colMat]);

  if (visFrames.length < 2) return null;

  return (
    <>
      {/* Main path */}
      {pathPts.length >= 2 && <Line points={pathPts} color={color} lineWidth={1.5} />}

      {/* Validation overlays */}
      {visibility.offRoad   && offRoadPts.length   >= 2 && <Line points={offRoadPts}   segments lineWidth={5} color={OVERLAY_COLORS.offRoad}   />}
      {visibility.airborne  && airbornePts.length  >= 2 && <Line points={airbornePts}  segments lineWidth={5} color={OVERLAY_COLORS.airborne}  />}
      {visibility.handbrake && handbrakePts.length >= 2 && <Line points={handbrakePts} segments lineWidth={5} color={OVERLAY_COLORS.handbrake} />}
      {visibility.collision && <primitive object={colPts} />}

      {/* Corner phase overlays */}
      {visibility.mid  && midPts.length  >= 2 && <Line points={midPts}  segments lineWidth={5} color={CORNER_COLORS.mid}  />}
      {visibility.exit && exitPts.length >= 2 && <Line points={exitPts} segments lineWidth={5} color={CORNER_COLORS.exit} />}

      {/* Corner labels */}
      {visCorners.map((c) => {
        const f = visFrames[c.apex];
        if (!f) return null;
        return (
          <Html key={c.id} position={[f.x, f.y + 4, f.z]} center style={{ pointerEvents: 'none' }}>
            <div style={{
              color: '#fff', fontSize: '11px', fontFamily: 'monospace',
              fontWeight: 700, padding: '2px 5px',
              background: 'rgba(0,0,0,0.65)', borderRadius: '3px',
              whiteSpace: 'nowrap', userSelect: 'none',
            }}>
              {c.id + 1}
            </div>
          </Html>
        );
      })}
    </>
  );
}

function CameraFit({ laps, trigger }: { laps: LapData[]; trigger: number }) {
  const { camera, controls } = useThree();
  useEffect(() => {
    if (trigger === 0) return;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, sumY = 0, n = 0;
    for (const lap of laps) {
      for (const f of lap.frames) {
        if (f.x < minX) minX = f.x; if (f.x > maxX) maxX = f.x;
        if (f.z < minZ) minZ = f.z; if (f.z > maxZ) maxZ = f.z;
        sumY += f.y; n++;
      }
    }
    if (n === 0) return;
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2, cy = sumY / n;
    const spread = Math.max(maxX - minX, maxZ - minZ, 20);
    const dist = spread * 0.75;
    camera.position.set(cx, cy + dist * 0.9, cz + dist * 0.5);
    camera.lookAt(cx, cy, cz);
    // Scale the clip planes to the track size — a long lap can span several km,
    // which would otherwise fall outside the default far plane and render blank.
    const cam = camera as THREE.PerspectiveCamera;
    cam.near = Math.max(0.1, dist / 1000);
    cam.far = Math.max(5000, dist * 10);
    cam.updateProjectionMatrix();
    const oc = controls as any;
    if (oc?.target) { oc.target.set(cx, cy, cz); oc.update(); }
  }, [trigger]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function Scene({
  laps, visibleLaps, lapStarts, playbackIdx, visibility, fitTrigger,
}: {
  laps: LapData[];
  visibleLaps: Set<number>;
  lapStarts: number[];
  playbackIdx: number | null;
  visibility: OverlayVisibility;
  fitTrigger: number;
}) {
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[50, 100, 50]} intensity={1.2} castShadow />
      <Grid
        args={[10000, 10000]} cellSize={10} cellColor="#1a1a2e"
        sectionSize={100} sectionColor="#2a2a4e"
        fadeDistance={8000} infiniteGrid position={[0, -0.05, 0]}
      />
      <CameraFit laps={laps} trigger={fitTrigger} />
      {laps.map((lap, i) =>
        visibleLaps.has(lap.index) ? (
          <LapLayer
            key={lap.index}
            lap={lap}
            color={LAP_PATH_COLORS[lap.index % LAP_PATH_COLORS.length]}
            lapStart={lapStarts[i] ?? 0}
            playbackIdx={playbackIdx}
            visibility={visibility}
          />
        ) : null,
      )}
    </>
  );
}

// ---- Legend ----------------------------------------------------------------

function LegendEntry({
  color, label, isLine, checked, onToggle,
}: {
  color: string;
  label: string;
  isLine: boolean;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="w-3.5 h-3.5 shrink-0 cursor-pointer"
        style={{ accentColor: color }}
      />
      {isLine ? (
        <span className="w-5 h-[3px] rounded shrink-0" style={{ backgroundColor: color }} />
      ) : (
        <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
      )}
      <span className="text-[12px] font-mono text-text-muted">{label}</span>
    </label>
  );
}

// ---- Public component ------------------------------------------------------

interface Props {
  packets: TelemetryData[];
  tuneType: TuneType;
  onClose: () => void;
}

export function TestLapViewer({ packets, tuneType, onClose }: Props) {
  const laps = useMemo(() => buildLapData(packets, tuneType), [packets, tuneType]);

  const [visibleLaps,    setVisibleLaps]    = useState<Set<number>>(() => new Set());
  const [fitTrigger,     setFitTrigger]     = useState(1);
  const [overlayVisible, setOverlayVisible] = useState<OverlayVisibility>(ALL_VISIBLE);
  const [playbackIdx,    setPlaybackIdx]    = useState<number | null>(null); // null = show full path
  const [isPlaying,      setIsPlaying]      = useState(false);

  const lapStarts = useMemo(() => {
    const starts: number[] = [];
    let acc = 0;
    for (const lap of laps) { starts.push(acc); acc += lap.frames.length; }
    return starts;
  }, [laps]);

  const totalFrames = useMemo(
    () => laps.reduce((s, l) => s + l.frames.length, 0),
    [laps],
  );

  // Reset all state when laps change
  useEffect(() => {
    setVisibleLaps(new Set(laps.map((l) => l.index)));
    setFitTrigger((n) => n + 1);
    setPlaybackIdx(null);
    setIsPlaying(false);
  }, [laps]);

  // RAF-based playback — 5× real-time at assumed 60 fps source data
  const playbackIdxRef = useRef<number | null>(null);
  useEffect(() => { playbackIdxRef.current = playbackIdx; }, [playbackIdx]);

  useEffect(() => {
    if (!isPlaying || totalFrames === 0) return;

    let animId: number;
    let lastTime: number | null = null;

    const step = (now: number) => {
      if (lastTime !== null) {
        const elapsed = now - lastTime;
        const advance = Math.max(1, Math.round((elapsed / 1000) * 60 * 5));
        const cur = playbackIdxRef.current ?? 0;
        const next = cur + advance;

        if (next >= totalFrames - 1) {
          setPlaybackIdx(null);   // playback complete — show full path
          setIsPlaying(false);
          return;
        }

        playbackIdxRef.current = next;
        setPlaybackIdx(next);
      }
      lastTime = now;
      animId = requestAnimationFrame(step);
    };

    animId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, totalFrames]); // eslint-disable-line react-hooks/exhaustive-deps

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      setIsPlaying(false);
    } else {
      // Restart from beginning when at end / full-path view
      const cur = playbackIdx ?? (totalFrames - 1);
      if (cur >= totalFrames - 1) setPlaybackIdx(0);
      setIsPlaying(true);
    }
  }, [isPlaying, playbackIdx, totalFrames]);

  const toggleLap = (idx: number) => {
    setVisibleLaps((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  const toggleOverlay = (key: OverlayKey) => {
    setOverlayVisible((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // ---- Time helpers --------------------------------------------------------

  const getFrameMs = (globalIdx: number): number => {
    if (laps.length === 0) return 0;
    const t0 = laps[0].frames[0]?.t ?? 0;
    let acc = 0;
    for (const lap of laps) {
      if (globalIdx < acc + lap.frames.length) {
        return (lap.frames[globalIdx - acc]?.t ?? t0) - t0;
      }
      acc += lap.frames.length;
    }
    const last = laps[laps.length - 1];
    return (last.frames[last.frames.length - 1]?.t ?? t0) - t0;
  };

  const fmtTime = (ms: number): string => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  const getCurrentLapLabel = (globalIdx: number): string => {
    let acc = 0;
    for (let i = 0; i < laps.length; i++) {
      if (globalIdx < acc + laps[i].frames.length) return `L${i + 1}`;
      acc += laps[i].frames.length;
    }
    return `L${laps.length}`;
  };

  const scrubValue   = playbackIdx ?? Math.max(0, totalFrames - 1);
  const currentMs    = getFrameMs(scrubValue);
  const totalMs      = getFrameMs(Math.max(0, totalFrames - 1));
  const lapLabel     = playbackIdx !== null ? getCurrentLapLabel(playbackIdx) : '';

  // ---- Render --------------------------------------------------------------

  if (packets.length === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-[#050508] flex items-center justify-center">
        <p className="text-xs font-mono text-text-dim">No recording data.</p>
        <button onClick={onClose} className="ml-4 h-7 px-3 rounded border border-border-muted bg-bg-input text-[10px] font-mono uppercase tracking-wider text-text-dim">
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#050508] flex flex-col">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-bg-surface shrink-0 flex-wrap">
        <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-text-dim">
          Test Lap Recording
        </span>

        <div className="w-px h-4 bg-border-muted" />

        {/* Lap toggles */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {laps.map((lap) => {
            const on = visibleLaps.has(lap.index);
            const color = LAP_PATH_COLORS[lap.index % LAP_PATH_COLORS.length];
            return (
              <button
                key={lap.index}
                onClick={() => toggleLap(lap.index)}
                className={`h-7 px-3 rounded border text-[10px] font-mono uppercase tracking-wider transition-colors ${
                  on ? 'bg-[--lc]/15 border-[--lc]/50 text-[--lc]' : 'border-border-muted bg-bg-input text-text-dim'
                }`}
                style={{ '--lc': color } as React.CSSProperties}
              >
                Lap {lap.index + 1}
                {' '}
                <span className="text-[9px] opacity-60">
                  {lap.corners.length}c · {lap.frames.length.toLocaleString()}f
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex-1" />

        <button
          onClick={onClose}
          className="h-7 px-3 rounded border border-border-muted bg-bg-input text-[10px] font-mono uppercase tracking-wider text-text-dim hover:text-text hover:border-border transition-colors"
        >
          Close
        </button>
      </div>

      {/* ── Canvas area ── */}
      <div className="relative flex-1 min-h-0 bg-[#050508]">
        <Canvas
          camera={{ position: [0, 120, 180], fov: 50, near: 0.1, far: 200000 }}
          gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
          onCreated={({ gl }) => gl.setClearColor(new THREE.Color('#050508'))}
        >
          <Suspense fallback={null}>
            <Scene
              laps={laps}
              visibleLaps={visibleLaps}
              lapStarts={lapStarts}
              playbackIdx={playbackIdx}
              visibility={overlayVisible}
              fitTrigger={fitTrigger}
            />
            <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
          </Suspense>
        </Canvas>

        {/* ── Top-right: fit button + legend ── */}
        <div className="absolute top-3 right-3 flex flex-col items-end gap-2">
          {/* Fit button */}
          <button
            onClick={() => setFitTrigger((n) => n + 1)}
            title="Fit path in view"
            className="h-7 w-7 inline-flex items-center justify-center rounded border border-border-muted bg-bg-surface/80 backdrop-blur text-text-muted hover:text-text hover:border-border transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M1 5V1h4M9 1h4v4M13 9v4H9M5 13H1V9" />
            </svg>
          </button>

          {/* Legend */}
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-2 px-3.5 py-3 rounded border border-border-muted bg-bg-surface/90 backdrop-blur min-w-[160px]">
              <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-dim">Validation</span>
              <LegendEntry color={OVERLAY_COLORS.collision} label="Collision"  isLine={false} checked={overlayVisible.collision} onToggle={() => toggleOverlay('collision')} />
              <LegendEntry color={OVERLAY_COLORS.offRoad}   label="Off-road"   isLine={true}  checked={overlayVisible.offRoad}   onToggle={() => toggleOverlay('offRoad')}   />
              <LegendEntry color={OVERLAY_COLORS.airborne}  label="Airborne"   isLine={true}  checked={overlayVisible.airborne}  onToggle={() => toggleOverlay('airborne')}  />
              <LegendEntry color={OVERLAY_COLORS.handbrake} label="Handbrake"  isLine={true}  checked={overlayVisible.handbrake} onToggle={() => toggleOverlay('handbrake')} />
            </div>
            <div className="flex flex-col gap-2 px-3.5 py-3 rounded border border-border-muted bg-bg-surface/90 backdrop-blur min-w-[160px]">
              <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-dim">Corners</span>
              <LegendEntry color={CORNER_COLORS.mid}  label="Mid-corner"  isLine={true} checked={overlayVisible.mid}  onToggle={() => toggleOverlay('mid')}  />
              <LegendEntry color={CORNER_COLORS.exit} label="Corner exit" isLine={true} checked={overlayVisible.exit} onToggle={() => toggleOverlay('exit')} />
            </div>
          </div>
        </div>

        {/* Empty overlay */}
        {laps.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-text-dim">
              Not enough data to render laps
            </span>
          </div>
        )}
      </div>

      {/* ── Timeline ── */}
      <div className="shrink-0 bg-bg-surface border-t border-border-muted px-4 py-2.5 flex items-center gap-3">
        {/* Play / Pause */}
        <button
          onClick={togglePlay}
          disabled={totalFrames === 0}
          title={isPlaying ? 'Pause' : 'Play'}
          className="h-7 w-7 inline-flex items-center justify-center rounded border border-border-muted bg-bg-input text-text-muted hover:text-text hover:border-border transition-colors disabled:opacity-30 shrink-0"
        >
          {isPlaying ? (
            <svg width="10" height="11" viewBox="0 0 10 11" fill="currentColor">
              <rect x="0" y="0" width="3.5" height="11" rx="1" />
              <rect x="6.5" y="0" width="3.5" height="11" rx="1" />
            </svg>
          ) : (
            <svg width="10" height="11" viewBox="0 0 10 11" fill="currentColor">
              <path d="M1 0.5 L9.5 5.5 L1 10.5 Z" />
            </svg>
          )}
        </button>

        {/* Show full path */}
        <button
          onClick={() => { setPlaybackIdx(null); setIsPlaying(false); }}
          disabled={playbackIdx === null}
          title="Show full path"
          className="h-7 px-2 rounded border border-border-muted bg-bg-input text-[9px] font-mono uppercase tracking-wider text-text-muted hover:text-text hover:border-border transition-colors disabled:opacity-30 shrink-0"
        >
          All
        </button>

        {/* Current position */}
        <div className="flex items-center gap-1.5 shrink-0 w-[5.5rem]">
          {lapLabel && (
            <span className="text-[10px] font-mono text-text-dim">{lapLabel}</span>
          )}
          <span className="text-[11px] font-mono text-text-muted tabular-nums">
            {fmtTime(currentMs)}
          </span>
        </div>

        {/* Scrubber */}
        <input
          type="range"
          min={0}
          max={Math.max(0, totalFrames - 1)}
          value={scrubValue}
          onChange={(e) => {
            setIsPlaying(false);
            const v = Number(e.target.value);
            setPlaybackIdx(v >= totalFrames - 1 ? null : v);
          }}
          className="flex-1 h-1 cursor-pointer"
          style={{ accentColor: '#00d4ff' }}
        />

        {/* Total duration */}
        <span className="text-[11px] font-mono text-text-dim tabular-nums shrink-0 w-[3rem] text-right">
          {fmtTime(totalMs)}
        </span>
      </div>
    </div>
  );
}
