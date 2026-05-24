import { Suspense, useRef, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { useTrackStore } from '../../store/trackStore';
import { CarModel } from './CarModel';
import { TrackPath } from './TrackPath';
import { Markers, LapMarker } from './Markers';
import { RaceOverlay } from './RaceOverlay';
import type { TrackMode, PathColorMetric, FztSession } from '@shared/track';

// ---- Camera auto-follow helper -------------------------------------------------

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

// ---- Scene contents ------------------------------------------------------------

interface SceneProps {
  isTracking: boolean;
  isPlayback: boolean;
  session: FztSession | null;
  playbackIndex: number;
  metric: PathColorMetric;
  mode: TrackMode;
}

function Scene({ isTracking, isPlayback, session, playbackIndex, metric, mode }: SceneProps) {
  const frames = useTrackStore((s) => s.frames);
  const laps = useTrackStore((s) => s.laps);
  const positionChanges = useTrackStore((s) => s.positionChanges);
  const liveFrame = useTrackStore((s) => s.liveFrame);

  if (isPlayback && session) {
    const pbFrames = session.frames.slice(0, playbackIndex + 1);
    const currentFrame = session.frames[playbackIndex] ?? null;
    return (
      <>
        <CameraAutoFrame active />
        <ambientLight intensity={0.6} />
        <directionalLight position={[50, 100, 50]} intensity={1.2} castShadow />
        <Grid
          args={[2000, 2000]}
          cellSize={10}
          cellColor="#1a1a2e"
          sectionSize={100}
          sectionColor="#2a2a4e"
          fadeDistance={800}
          position={[0, -0.05, 0]}
        />
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
      <ambientLight intensity={0.6} />
      <directionalLight position={[50, 100, 50]} intensity={1.2} castShadow />
      <Grid
        args={[2000, 2000]}
        cellSize={10}
        cellColor="#1a1a2e"
        sectionSize={100}
        sectionColor="#2a2a4e"
        fadeDistance={800}
        position={[0, -0.05, 0]}
      />
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

  // Playback auto-advance.
  useEffect(() => {
    if (!isPlaying || !playbackSession) return;
    if (playbackIndex >= playbackSession.frames.length - 1) {
      setPlaying(false);
      return;
    }
    const id = requestAnimationFrame(() => {
      setPlaybackIndex(Math.min(playbackIndex + 2, playbackSession.frames.length - 1));
    });
    return () => cancelAnimationFrame(id);
  }, [isPlaying, playbackIndex, playbackSession, setPlaybackIndex, setPlaying]);

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
          />
          <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
        </Suspense>
      </Canvas>

      {/* Race overlay (absolute positioned over canvas) */}
      {raceOverlayFrame && <RaceOverlay frame={raceOverlayFrame} />}

      {/* Playback scrubber */}
      {isPlayback && playbackSession && (
        <PlaybackBar
          session={playbackSession}
          index={playbackIndex}
          isPlaying={isPlaying}
          onChange={setPlaybackIndex}
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

  return (
    <div className="absolute bottom-0 left-0 right-0 flex items-center gap-3 px-4 py-2.5 bg-bg-surface/90 backdrop-blur border-t border-border">
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
    </div>
  );
}
