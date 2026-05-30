import { Suspense, useRef, useEffect, useMemo, useState } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import * as THREE from 'three';
import { useTrackStore } from '../../store/trackStore';
import { usePlaybackStore } from '../../store/playbackStore';
import { useEffectiveTimeWindow } from '../../hooks/useEffectiveTimeWindow';
import { CarModel } from './CarModel';
import { TrackPath } from './TrackPath';
import { ValidationOverlay, VALIDATION_COLORS } from './ValidationOverlay';
import { Markers, LapMarker } from './Markers';
import { RaceOverlay } from './RaceOverlay';
import type { TrackMode, PathColorMetric, FztSession, TrackFrame } from '@shared/track';

// ---- Camera helpers ------------------------------------------------------------

function CameraAutoFrame({ active }: { active: boolean }) {
  const { camera } = useThree();
  const initialised = useRef(false);

  useEffect(() => {
    if (!active || initialised.current) return;
    camera.position.set(0, 120, 180);
    camera.lookAt(0, 0, 0);
    initialised.current = true;
  }, [active, camera]);

  return null;
}

function CameraFit({ frames, trigger }: { frames: TrackFrame[]; trigger: number }) {
  const framesRef = useRef(frames);
  framesRef.current = frames;
  const { camera, controls } = useThree();

  useEffect(() => {
    if (trigger === 0) return;
    const fs = framesRef.current;
    if (fs.length === 0) return;

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, sumY = 0;
    for (const f of fs) {
      if (f.x < minX) minX = f.x; if (f.x > maxX) maxX = f.x;
      if (f.z < minZ) minZ = f.z; if (f.z > maxZ) maxZ = f.z;
      sumY += f.y;
    }
    const cx = (minX + maxX) / 2;
    const cy = sumY / fs.length;
    const cz = (minZ + maxZ) / 2;
    const spread = Math.max(maxX - minX, maxZ - minZ, 20);
    const dist = spread * 0.75;

    camera.position.set(cx, cy + dist * 0.9, cz + dist * 0.5);
    camera.lookAt(cx, cy, cz);
    const oc = controls as any;
    if (oc?.target) { oc.target.set(cx, cy, cz); oc.update(); }
  }, [trigger]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

function CameraFollow({ enabled, frame }: { enabled: boolean; frame: TrackFrame | null }) {
  const { camera, controls } = useThree();
  useFrame(() => {
    if (!enabled || !frame) return;
    const oc = controls as any;
    if (!oc?.target) return;
    const carPos = new THREE.Vector3(frame.x, frame.y, frame.z);
    const delta = carPos.clone().sub(oc.target).multiplyScalar(0.1);
    oc.target.add(delta);
    camera.position.add(delta);
    oc.update();
  });
  return null;
}

// ---- Scene contents ------------------------------------------------------------

interface SceneProps {
  isTracking: boolean;
  isPlayback: boolean;
  session: FztSession | null;
  frameIndex: number;
  metric: PathColorMetric;
  mode: TrackMode;
  fitTrigger: number;
  followCar: boolean;
  showValidation: boolean;
  /** Windowed frames for path/overlay display; may be a time-sliced subset of the full store frames. */
  displayFrames: TrackFrame[];
}

function Scene({ isTracking, isPlayback, session, frameIndex, metric, mode, fitTrigger, followCar, showValidation, displayFrames }: SceneProps) {
  const frames = useTrackStore((s) => s.frames);
  const laps = useTrackStore((s) => s.laps);
  const positionChanges = useTrackStore((s) => s.positionChanges);
  const liveFrame = useTrackStore((s) => s.liveFrame);

  // allFrames is used for camera fitting (full extent), displayFrames for path rendering.
  const allFrames = isPlayback && session ? session.frames : frames;
  const currentFrame = isPlayback && session ? (session.frames[frameIndex] ?? null) : liveFrame;

  const commonLights = (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[50, 100, 50]} intensity={1.2} castShadow />
    </>
  );
  const grid = (
    <Grid
      args={[2000, 2000]}
      cellSize={10}
      cellColor="#1a1a2e"
      sectionSize={100}
      sectionColor="#2a2a4e"
      fadeDistance={800}
      position={[0, -0.05, 0]}
    />
  );

  if (isPlayback && session) {
    const pbFrames = session.frames.slice(0, frameIndex + 1);
    return (
      <>
        <CameraAutoFrame active />
        <CameraFit frames={allFrames} trigger={fitTrigger} />
        <CameraFollow enabled={followCar} frame={currentFrame} />
        {commonLights}
        {grid}
        <TrackPath frames={pbFrames} metric={metric} rebuildEveryFrame />
        {showValidation && <ValidationOverlay frames={pbFrames} rebuildEveryFrame />}
        <CarModel playbackFrame={currentFrame} />
        {session.mode === 'race' && (
          <>
            <Markers positionChanges={session.positionChanges.filter((pc) => pc.frameIndex <= frameIndex)} />
            {session.laps.map((lap, i) => {
              const f = session.frames[lap.startFrame];
              if (!f) return null;
              return <LapMarker key={i} x={f.x} y={f.y} z={f.z} lapNumber={lap.lapNumber} />;
            })}
          </>
        )}
      </>
    );
  }

  // Live mode: use displayFrames (time-windowed) for path rendering,
  // full frames for lap marker positions and camera fitting.
  const isWindowed = displayFrames !== frames;
  return (
    <>
      <CameraAutoFrame active={isTracking && frames.length === 1} />
      <CameraFit frames={allFrames} trigger={fitTrigger} />
      <CameraFollow enabled={followCar} frame={currentFrame} />
      {commonLights}
      {grid}
      {(isTracking || displayFrames.length > 0) && (
        <TrackPath frames={displayFrames} metric={metric} rebuildEveryFrame={isWindowed} />
      )}
      {showValidation && (isTracking || displayFrames.length > 0) && (
        <ValidationOverlay frames={displayFrames} rebuildEveryFrame={isWindowed} />
      )}
      <CarModel />
      {mode === 'race' && (
        <>
          <Markers positionChanges={positionChanges} />
          {laps.map((lap, i) => {
            const f = frames[lap.startFrame];
            if (!f) return null;
            return <LapMarker key={i} x={f.x} y={f.y} z={f.z} lapNumber={lap.lapNumber} />;
          })}
        </>
      )}
    </>
  );
}

// ---- Public component ----------------------------------------------------------

interface TrackViewerProps {
  mode: TrackMode;
  isTracking: boolean;
  metric: PathColorMetric;
  showValidation: boolean;
}

export function TrackViewer({ mode, isTracking, metric, showValidation }: TrackViewerProps) {
  const session = usePlaybackStore((s) => s.session);
  const frameIndex = usePlaybackStore((s) => s.frameIndex);
  const frames = useTrackStore((s) => s.frames);
  const liveFrame = useTrackStore((s) => s.liveFrame);

  const isPlayback = session !== null && session.frames.length > 0;
  const raceOverlayFrame = isPlayback
    ? (session?.frames[frameIndex] ?? null)
    : (mode === 'race' ? liveFrame : null);

  const [fitTrigger, setFitTrigger] = useState(0);
  const [followCar, setFollowCar] = useState(false);

  // Apply the global time window to the live path.
  // During recording the effective window expands to cover the full session,
  // so the complete recorded path remains visible. For pure tracking the
  // window trims the oldest frames as new ones arrive.
  const effectiveWindowSec = useEffectiveTimeWindow();
  const displayFrames = useMemo<TrackFrame[]>(() => {
    if (isPlayback || !isTracking) return frames;
    const cutoffMs = Date.now() - effectiveWindowSec * 1000;
    let start = 0;
    while (start < frames.length && frames[start].t < cutoffMs) start++;
    return start === 0 ? frames : frames.slice(start);
  }, [frames, isTracking, isPlayback, effectiveWindowSec]);

  return (
    <div className="relative flex-1 min-h-0 bg-[#050508]">
      <Canvas
        camera={{ position: [0, 120, 180], fov: 50 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
        onCreated={({ gl }) => {
          gl.setClearColor(new THREE.Color('#050508'));
        }}
      >
        <Suspense fallback={null}>
          <Scene
            isTracking={isTracking}
            isPlayback={isPlayback}
            session={session}
            frameIndex={frameIndex}
            metric={metric}
            mode={mode}
            fitTrigger={fitTrigger}
            followCar={followCar}
            showValidation={showValidation}
            displayFrames={displayFrames}
          />
          <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
        </Suspense>
      </Canvas>

      {/* Fit / Follow camera buttons */}
      <div className="absolute top-3 right-3 flex flex-col gap-1.5">
        <button
          onClick={() => { setFollowCar(false); setFitTrigger((n) => n + 1); }}
          title="Fit path in view"
          className="h-7 w-7 inline-flex items-center justify-center rounded border border-border-muted bg-bg-surface/80 backdrop-blur text-text-muted hover:text-text hover:border-border transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M1 5V1h4M9 1h4v4M13 9v4H9M5 13H1V9" />
          </svg>
        </button>
        <button
          onClick={() => setFollowCar((v) => !v)}
          title={followCar ? 'Stop following car' : 'Follow car'}
          className={`h-7 w-7 inline-flex items-center justify-center rounded border transition-colors ${
            followCar
              ? 'border-[#00d4ff]/60 bg-[#00d4ff]/15 text-[#00d4ff]'
              : 'border-border-muted bg-bg-surface/80 backdrop-blur text-text-muted hover:text-text hover:border-border'
          }`}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <circle cx="7" cy="7" r="2.5" />
            <path d="M7 1v2.5M7 10.5V13M1 7h2.5M10.5 7H13" />
          </svg>
        </button>
      </div>

      {/* Validation legend */}
      {showValidation && (
        <div className="absolute bottom-3 left-3 flex flex-col gap-1 px-2.5 py-2 rounded border border-border-muted bg-bg-surface/80 backdrop-blur">
          <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-text-dim mb-0.5">
            Validation
          </span>
          <LegendRow color={VALIDATION_COLORS.collision} label="Collision" shape="dot" />
          <LegendRow color={VALIDATION_COLORS.offRoad} label="Off-road" shape="line" />
          <LegendRow color={VALIDATION_COLORS.airborne} label="Airborne" shape="line" />
        </div>
      )}

      {/* Race overlay (absolute positioned over canvas) */}
      {raceOverlayFrame && <RaceOverlay frame={raceOverlayFrame} />}

      {/* Empty state */}
      {!isTracking && !isPlayback && frames.length === 0 && !liveFrame && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-text-dim">
            Enable Tracking or press Record to start drawing the path
          </span>
        </div>
      )}
    </div>
  );
}

function LegendRow({ color, label, shape }: { color: string; label: string; shape: 'dot' | 'line' }) {
  return (
    <div className="flex items-center gap-2">
      {shape === 'dot' ? (
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
      ) : (
        <span className="w-3 h-[2px] shrink-0" style={{ backgroundColor: color }} />
      )}
      <span className="text-[10px] font-mono text-text-muted">{label}</span>
    </div>
  );
}
