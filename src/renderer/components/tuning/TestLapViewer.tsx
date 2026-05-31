import { Suspense, useMemo, useState, useEffect, useRef } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
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

// ---- Data conversion -----------------------------------------------------------

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
  return groups.filter((g) => g.length > 60); // drop sub-second noise
}

// ---- Per-lap pre-computed data -------------------------------------------------

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

// ---- Segment-point helpers -----------------------------------------------------

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

// ---- 3D scene sub-components ---------------------------------------------------

function LapLayer({ lap, color }: { lap: LapData; color: string }) {
  const pathPts = useMemo(
    () => lap.frames.map((f): Pt3 => [f.x, f.y + 0.1, f.z]),
    [lap.frames],
  );

  const offRoadPts   = useMemo(() => buildFlagSegments(lap.frames, 'offRoad',   0.30), [lap.frames]);
  const airbornePts  = useMemo(() => buildFlagSegments(lap.frames, 'airborne',  0.45), [lap.frames]);
  const handbrakePts = useMemo(() => buildFlagSegments(lap.frames, 'handbrake', 0.20), [lap.frames]);
  const midPts       = useMemo(() => buildPhaseSegments(lap.frames, lap.derivedFrames, 'mid',  0.65), [lap]);
  const exitPts      = useMemo(() => buildPhaseSegments(lap.frames, lap.derivedFrames, 'exit', 0.65), [lap]);

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
    for (const f of lap.frames) if (f.collision) pos.push(f.x, f.y + 0.6, f.z);
    colGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  }, [lap.frames, colGeo]);
  useEffect(() => () => { colGeo.dispose(); colMat.dispose(); }, [colGeo, colMat]);

  return (
    <>
      {/* Main path */}
      {pathPts.length >= 2 && <Line points={pathPts} color={color} lineWidth={1.5} />}

      {/* Validation overlays */}
      {offRoadPts.length   >= 2 && <Line points={offRoadPts}   segments lineWidth={5} color={OVERLAY_COLORS.offRoad}   />}
      {airbornePts.length  >= 2 && <Line points={airbornePts}  segments lineWidth={5} color={OVERLAY_COLORS.airborne}  />}
      {handbrakePts.length >= 2 && <Line points={handbrakePts} segments lineWidth={5} color={OVERLAY_COLORS.handbrake} />}
      <primitive object={colPts} />

      {/* Corner phase overlays */}
      {midPts.length  >= 2 && <Line points={midPts}  segments lineWidth={5} color={CORNER_COLORS.mid}  />}
      {exitPts.length >= 2 && <Line points={exitPts} segments lineWidth={5} color={CORNER_COLORS.exit} />}

      {/* Corner labels */}
      {lap.corners.map((c) => {
        const f = lap.frames[c.apex];
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

function Scene({ laps, visibleLaps, fitTrigger }: {
  laps: LapData[];
  visibleLaps: Set<number>;
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
      {laps.map((lap) =>
        visibleLaps.has(lap.index) ? (
          <LapLayer key={lap.index} lap={lap} color={LAP_PATH_COLORS[lap.index % LAP_PATH_COLORS.length]} />
        ) : null,
      )}
    </>
  );
}

// ---- Legend -------------------------------------------------------------------

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <span className="text-[10px] font-mono text-text-muted">{label}</span>
    </div>
  );
}
function LegendLine({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-3 h-[3px] rounded shrink-0" style={{ backgroundColor: color }} />
      <span className="text-[10px] font-mono text-text-muted">{label}</span>
    </div>
  );
}

// ---- Public component ---------------------------------------------------------

interface Props {
  packets: TelemetryData[];
  tuneType: TuneType;
  onClose: () => void;
}

export function TestLapViewer({ packets, tuneType, onClose }: Props) {
  const laps = useMemo(() => buildLapData(packets, tuneType), [packets, tuneType]);
  const [visibleLaps, setVisibleLaps] = useState<Set<number>>(() => new Set(laps.map((l) => l.index)));
  const [fitTrigger, setFitTrigger] = useState(1);

  // When laps first computed, make all visible
  useEffect(() => {
    setVisibleLaps(new Set(laps.map((l) => l.index)));
    setFitTrigger((n) => n + 1);
  }, [laps]);

  const toggleLap = (idx: number) => {
    setVisibleLaps((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

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

      {/* ── Canvas ── */}
      <div className="relative flex-1 min-h-0 bg-[#050508]">
        <Canvas
          camera={{ position: [0, 120, 180], fov: 50, near: 0.1, far: 200000 }}
          gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
          onCreated={({ gl }) => gl.setClearColor(new THREE.Color('#050508'))}
        >
          <Suspense fallback={null}>
            <Scene laps={laps} visibleLaps={visibleLaps} fitTrigger={fitTrigger} />
            <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
          </Suspense>
        </Canvas>

        {/* Fit button */}
        <div className="absolute top-3 right-3">
          <button
            onClick={() => setFitTrigger((n) => n + 1)}
            title="Fit path in view"
            className="h-7 w-7 inline-flex items-center justify-center rounded border border-border-muted bg-bg-surface/80 backdrop-blur text-text-muted hover:text-text hover:border-border transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M1 5V1h4M9 1h4v4M13 9v4H9M5 13H1V9" />
            </svg>
          </button>
        </div>

        {/* Legend */}
        <div className="absolute bottom-3 left-3 flex flex-col gap-2">
          <div className="flex flex-col gap-1 px-2.5 py-2 rounded border border-border-muted bg-bg-surface/80 backdrop-blur">
            <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-text-dim mb-0.5">Validation</span>
            <LegendDot  color={OVERLAY_COLORS.collision} label="Collision"  />
            <LegendLine color={OVERLAY_COLORS.offRoad}   label="Off-road"   />
            <LegendLine color={OVERLAY_COLORS.airborne}  label="Airborne"   />
            <LegendLine color={OVERLAY_COLORS.handbrake} label="Handbrake"  />
          </div>
          <div className="flex flex-col gap-1 px-2.5 py-2 rounded border border-border-muted bg-bg-surface/80 backdrop-blur">
            <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-text-dim mb-0.5">Corners</span>
            <LegendLine color={CORNER_COLORS.mid}  label="Mid-corner"  />
            <LegendLine color={CORNER_COLORS.exit} label="Corner exit" />
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
    </div>
  );
}
