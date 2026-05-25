import { create } from 'zustand';
import type { TelemetryData } from '@shared/telemetry';
import type {
  FztSession,
  LapInfo,
  PathColorMetric,
  PositionChange,
  TrackFrame,
  TrackMode,
} from '@shared/track';

/** Minimum distance (metres) a car must travel before adding a new path point. */
const MIN_STEP_M = 0.3;

function avgSlip(d: TelemetryData): number {
  return (
    d.tireCombinedSlipFrontLeft +
    d.tireCombinedSlipFrontRight +
    d.tireCombinedSlipRearLeft +
    d.tireCombinedSlipRearRight
  ) / 4;
}

interface TrackStoreState {
  // --- Live tracking ---
  isTracking: boolean;
  mode: TrackMode;
  startedAt: number | null;
  origin: { x: number; y: number; z: number } | null;
  frames: TrackFrame[];
  laps: LapInfo[];
  positionChanges: PositionChange[];

  // Private tracking state (not rendered, but needed for lap/position detection)
  _prevLap: number;
  _prevRacePos: number;
  _lastX: number;
  _lastY: number;
  _lastZ: number;

  // --- Live car position (always updated, independent of recording) ---
  liveFrame: TrackFrame | null;

  // --- Playback ---
  playbackSession: FztSession | null;
  playbackIndex: number;
  isPlaying: boolean;

  // --- UI state ---
  colorMetric: PathColorMetric;

  // --- Actions ---
  startTracking: (mode: TrackMode) => void;
  stopTracking: () => void;
  pushTelemetry: (data: TelemetryData) => void;
  setPlaybackSession: (session: FztSession | null) => void;
  setPlaybackIndex: (index: number) => void;
  setPlaying: (playing: boolean) => void;
  setColorMetric: (metric: PathColorMetric) => void;
}

export const useTrackStore = create<TrackStoreState>((set, get) => ({
  isTracking: false,
  mode: 'free',
  startedAt: null,
  origin: null,
  frames: [],
  laps: [],
  positionChanges: [],
  _prevLap: -1,
  _prevRacePos: 0,
  _lastX: 0,
  _lastY: 0,
  _lastZ: 0,
  liveFrame: null,
  playbackSession: null,
  playbackIndex: 0,
  isPlaying: false,
  colorMetric: 'speed',

  startTracking(mode) {
    set({
      isTracking: true,
      mode,
      startedAt: Date.now(),
      origin: null,
      frames: [],
      laps: [],
      positionChanges: [],
      _prevLap: -1,
      _prevRacePos: 0,
      _lastX: 0,
      _lastY: 0,
      _lastZ: 0,
    });
  },

  stopTracking() {
    set({ isTracking: false, origin: null });
  },

  pushTelemetry(data) {
    if (!data.isRaceOn) return;

    const state = get();

    // Resolve origin FIRST. When tracking, latch to the first packet's world
    // position. When idle, self-reference so the car always sits at (0,0,0).
    let origin = state.origin;
    if (state.isTracking && origin === null) {
      origin = { x: data.positionX, y: data.positionY, z: data.positionZ };
    }

    const refX = origin?.x ?? data.positionX;
    const refY = origin?.y ?? data.positionY;
    const refZ = origin?.z ?? data.positionZ;
    const rx = data.positionX - refX;
    const ry = data.positionY - refY;
    const rz = -(data.positionZ - refZ);

    const frame: TrackFrame = {
      t: data.receivedAt,
      x: rx,
      y: ry,
      z: rz,
      yaw: data.yaw,
      pitch: data.pitch,
      roll: data.roll,
      speed: data.speed,
      grip: avgSlip(data),
      throttle: data.accel / 255,
      brake: data.brake / 255,
      rumble:
        data.wheelOnRumbleStripFrontLeft > 0.5 ||
        data.wheelOnRumbleStripFrontRight > 0.5 ||
        data.wheelOnRumbleStripRearLeft > 0.5 ||
        data.wheelOnRumbleStripRearRight > 0.5,
      puddle:
        data.wheelInPuddleDepthFrontLeft > 0.02 ||
        data.wheelInPuddleDepthFrontRight > 0.02 ||
        data.wheelInPuddleDepthRearLeft > 0.02 ||
        data.wheelInPuddleDepthRearRight > 0.02,
      racePos: data.racePosition,
      lapNumber: data.lapNumber,
      currentLap: data.currentLap,
      bestLap: data.bestLap,
      lastLap: data.lastLap,
      currentRaceTime: data.currentRaceTime,
    };

    if (!state.isTracking) {
      set({ liveFrame: frame });
      return;
    }

    // Distance gate — avoid cluttering the path when stationary.
    const dx = rx - state._lastX;
    const dy = ry - state._lastY;
    const dz = rz - state._lastZ;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (state.frames.length > 0 && dist < MIN_STEP_M) {
      set({ origin, liveFrame: frame });
      return;
    }

    const frames = [...state.frames, frame];
    const frameIndex = frames.length - 1;
    const laps = [...state.laps];
    const positionChanges = [...state.positionChanges];

    // Lap detection (race mode). Forza reports laps 0-indexed.
    let prevLap = state._prevLap;
    if (state.mode === 'race' && data.lapNumber !== prevLap) {
      if (prevLap >= 0) {
        laps.push({ lapNumber: prevLap + 1, startFrame: frameIndex, lapTime: data.lastLap });
      }
      prevLap = data.lapNumber;
    }

    // Race position change detection (race mode).
    let prevRacePos = state._prevRacePos;
    if (
      state.mode === 'race' &&
      data.racePosition > 0 &&
      prevRacePos > 0 &&
      data.racePosition !== prevRacePos
    ) {
      positionChanges.push({ frameIndex, x: rx, y: ry, z: rz, from: prevRacePos, to: data.racePosition });
    }
    if (data.racePosition > 0) prevRacePos = data.racePosition;

    set({
      origin,
      frames,
      laps,
      positionChanges,
      liveFrame: frame,
      _prevLap: prevLap,
      _prevRacePos: prevRacePos,
      _lastX: rx,
      _lastY: ry,
      _lastZ: rz,
    });
  },

  setPlaybackSession(session) {
    set({ playbackSession: session, playbackIndex: 0, isPlaying: false });
  },

  setPlaybackIndex(index) {
    set({ playbackIndex: index });
  },

  setPlaying(playing) {
    set({ isPlaying: playing });
  },

  setColorMetric(metric) {
    set({ colorMetric: metric });
  },
}));
