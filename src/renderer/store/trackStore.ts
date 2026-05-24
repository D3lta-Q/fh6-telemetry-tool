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
  _prevLap: 0,
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
      _prevLap: 0,
      _prevRacePos: 0,
      _lastX: 0,
      _lastY: 0,
      _lastZ: 0,
    });
  },

  stopTracking() {
    set({ isTracking: false });
  },

  pushTelemetry(data) {
    const state = get();

    // Always update liveFrame so the car model is visible even when not recording.
    const liveFrame: TrackFrame = {
      t: data.receivedAt,
      x: data.positionX - (state.origin?.x ?? data.positionX),
      y: data.positionY - (state.origin?.y ?? data.positionY),
      z: data.positionZ - (state.origin?.z ?? data.positionZ),
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
      set({ liveFrame });
      return;
    }

    // Latch origin on first recorded packet.
    const origin = state.origin ?? { x: data.positionX, y: data.positionY, z: data.positionZ };

    // Relative position.
    const rx = data.positionX - origin.x;
    const ry = data.positionY - origin.y;
    const rz = data.positionZ - origin.z;

    // Distance gate — avoid cluttering the path when stationary.
    const dx = rx - state._lastX;
    const dy = ry - state._lastY;
    const dz = rz - state._lastZ;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (state.frames.length > 0 && dist < MIN_STEP_M) {
      set({ liveFrame });
      return;
    }

    const frame: TrackFrame = { ...liveFrame, x: rx, y: ry, z: rz };

    const frames = [...state.frames, frame];
    const frameIndex = frames.length - 1;
    const laps = [...state.laps];
    const positionChanges = [...state.positionChanges];

    // Lap detection (race mode).
    let prevLap = state._prevLap;
    if (state.mode === 'race' && data.lapNumber !== prevLap) {
      if (prevLap > 0) {
        laps.push({ lapNumber: prevLap, startFrame: frameIndex, lapTime: data.lastLap });
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
