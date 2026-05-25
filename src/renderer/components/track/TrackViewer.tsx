import { Suspense, useRef, useEffect, useState } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import * as THREE from 'three';
import { useTrackStore } from '../../store/trackStore';
import { CarModel } from './CarModel';
import { TrackPath } from './TrackPath';
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
  playbackIndex: number;
  metric: PathColorMetric;
  mode: TrackMode;
  fitTrigger: number;
  followCar: boolean;
}

function Scene({ isTracking, isPlayback, session, playbackIndex, metric, mode, fitTrigger, followCar }: SceneProps) {
  const frames = useTrackStore((s) => s.frames);
  const laps = useTrackStore((s) => s.laps);
  const positionChanges = useTrackStore((s) => s.positionChanges);
  const liveFrame = useTrackStore((s) => s.liveFrame);

  const allFrames = isPlayback && session ? session.frames : frames;
  const currentFrame = isPlayback && session ? (session.frames[playbackIndex] ?? null) : liveFrame;

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
    const pbFrames = session.frames.slice(0, playbackIndex + 1);
    return (
      <>
        <CameraAutoFrame active />
        <CameraFit frames={allFrames} trigger={fitTrigger} />
        <CameraFollow enabled={followCar} frame={currentFrame} />
        {commonLights}
        {grid}
        <TrackPath frames={pbFrames} metric={metric} rebuildEveryFrame />
        <CarModel playbackFrame={currentFrame} />
        {session.mode === 'race' && (
          <>
            <Markers positionChanges={session.positionChanges.filter((pc) => pc.frameIndex <= playbackIndex)} />
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

  return (
    <>
      <CameraAutoFrame active={isTracking && frames.length === 1} />
      <CameraFit frames={allFrames} trigger={fitTrigger} />
      <CameraFollow enabled={followCar} frame={currentFrame} />
      {commonLights}
      {grid}
      {(isTracking || frames.length > 0) && (
        <TrackPath frames={frames} metric={metric} />
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
}

export function TrackViewer({ mode, isTracking, metric }: TrackViewerProps) {
  const playbackSession = useTrackStore((s) => s.playbackSession);
  const playbackIndex = useTrackStore((s) => s.playbackIndex);
  const isPlaying = useTrackStore((s) => s.isPlaying);
  const setPlaybackIndex = useTrackStore((s) => s.setPlaybackIndex);
  const setPlaying = useTrackStore((s) => s.setPlaying);
  const frames = useTrackStore((s) => s.frames);
  const liveFrame = useTrackStore((s) => s.liveFrame);

  const isPlayback = playbackSession !== null;
  const raceOverlayFrame = isPlayback
    ? (playbackSession?.frames[playbackIndex] ?? null)
    : (mode === 'race' ? liveFrame : null);

  const [fitTrigger, setFitTrigger] = useState(0);
  const [followCar, setFollowCar] = useState(false);

  // Real-time playback: advance to the frame matching elapsed wall-clock time.
  // playbackIndex is intentionally excluded from deps — the anchor is set once
  // when play starts; scrubbing while playing pauses first via the onChange handler.
  useEffect(() => {
    if (!isPlaying || !playbackSession) return;
    if (playbackIndex >= playbackSession.frames.length - 1) {
      setPlaying(false);
      return;
    }

    const session = playbackSession;
    const anchor = {
      wallTime: performance.now(),
      frameT: session.frames[playbackIndex]?.t ?? 0,
      startIndex: playbackIndex,
    };

    let rafId: number;
    const tick = () => {
      const targetT = anchor.frameT + (performance.now() - anchor.wallTime);
      let lo = anchor.startIndex, hi = session.frames.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if ((session.frames[mid]?.t ?? Infinity) <= targetT) lo = mid;
        else hi = mid - 1;
      }
      if (lo >= session.frames.length - 1) {
        setPlaybackIndex(session.frames.length - 1);
        setPlaying(false);
        return;
      }
      setPlaybackIndex(lo);
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, playbackSession, setPlaybackIndex, setPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

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
            session={playbackSession}
            playbackIndex={playbackIndex}
            metric={metric}
            mode={mode}
            fitTrigger={fitTrigger}
            followCar={followCar}
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

      {/* Race overlay (absolute positioned over canvas) */}
      {raceOverlayFrame && <RaceOverlay frame={raceOverlayFrame} />}

      {/* Playback scrubber */}
      {isPlayback && playbackSession && (
        <PlaybackBar
          session={playbackSession}
          index={playbackIndex}
          isPlaying={isPlaying}
          onChange={(i) => { setPlaybackIndex(i); if (isPlaying) setPlaying(false); }}
          onTogglePlay={() => setPlaying(!isPlaying)}
        />
      )}

      {/* Empty state */}
      {!isTracking && !isPlayback && frames.length === 0 && !liveFrame && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-text-dim">
            Press Start to begin recording a path
          </span>
        </div>
      )}
    </div>
  );
}

// ---- Playback bar --------------------------------------------------------------

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface PlaybackBarProps {
  session: FztSession;
  index: number;
  isPlaying: boolean;
  onChange: (i: number) => void;
  onTogglePlay: () => void;
}

function PlaybackBar({ session, index, isPlaying, onChange, onTogglePlay }: PlaybackBarProps) {
  const total = session.frames.length - 1;
  const currentMs = (session.frames[index]?.t ?? session.startedAt) - session.startedAt;
  const totalMs = session.endedAt - session.startedAt;

  const [showLaps, setShowLaps] = useState(true);
  const [showPositions, setShowPositions] = useState(true);

  const hasLaps = session.laps.length > 0;
  const hasPositions = session.positionChanges.length > 0;

  return (
    <div className="absolute bottom-0 left-0 right-0 flex flex-col bg-bg-surface/90 backdrop-blur border-t border-border">
      {/* Timeline markers row */}
      {(hasLaps || hasPositions) && (
        <div className="relative h-4 mx-[72px] mr-[160px]">
          {showLaps && session.laps.map((lap, i) => (
            <div
              key={`lap-${i}`}
              className="absolute top-0.5 w-px h-3 bg-[#ffd60a]"
              style={{ left: `${(lap.startFrame / total) * 100}%` }}
              title={`Lap ${lap.lapNumber}`}
            />
          ))}
          {showPositions && session.positionChanges.map((pc, i) => {
            const gained = pc.to < pc.from;
            return (
              <div
                key={`pos-${i}`}
                className="absolute top-0 flex flex-col items-center"
                style={{ left: `${(pc.frameIndex / total) * 100}%` }}
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
          onClick={onTogglePlay}
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
          max={total}
          value={index}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer bg-bg-input accent-[#00d4ff]"
        />
        <span className="text-[10px] font-mono text-text-dim tabular-nums w-10 shrink-0 text-right">
          {formatTime(totalMs)}
        </span>
        <span className="text-[9px] font-mono uppercase tracking-wider text-text-dim shrink-0">
          {session.frames.length.toLocaleString()} pts
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
      </div>
    </div>
  );
}
