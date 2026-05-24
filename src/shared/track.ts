/**
 * Types for the 3D track path visualization and session recording.
 *
 * File format: .fzt (Forza Track)
 * Positions are stored relative to the session origin (the car's world
 * position when recording started) so that scenes load centred at [0,0,0].
 */

export type TrackMode = 'free' | 'race';

/** Data point sampled from a telemetry packet during track recording. */
export interface TrackFrame {
  /** receivedAt (ms) of the source packet. */
  t: number;
  /** Position in metres, relative to session origin. */
  x: number;
  y: number;
  z: number;
  /** Vehicle orientation (radians). */
  yaw: number;
  pitch: number;
  roll: number;
  /** Speed in m/s. */
  speed: number;
  /** Average combined slip across all four tyres (0 = full grip, ≥1 = sliding). */
  grip: number;
  /** Throttle 0..1. */
  throttle: number;
  /** Brake 0..1. */
  brake: number;
  /** True if any wheel is on a rumble strip. */
  rumble: boolean;
  /** True if any wheel is in a puddle (depth > 0.02 m). */
  puddle: boolean;
  /** Current race position (1-based). 0 if not in race. */
  racePos: number;
  lapNumber: number;
  /** Seconds elapsed on current lap. */
  currentLap: number;
  /** Seconds of best lap (0 if none yet). */
  bestLap: number;
  /** Seconds of last completed lap (0 if none yet). */
  lastLap: number;
  /** Total race time in seconds. */
  currentRaceTime: number;
}

/** Recorded info for a single completed lap (race mode only). */
export interface LapInfo {
  lapNumber: number;
  /** Index into `frames` where this lap started. */
  startFrame: number;
  /** Lap time in seconds. */
  lapTime: number;
}

/** A race-position change event (race mode only). */
export interface PositionChange {
  /** Index into `frames` when the change occurred. */
  frameIndex: number;
  x: number;
  y: number;
  z: number;
  from: number;
  to: number;
}

/** Complete recorded session saved to a .fzt file. */
export interface FztSession {
  version: 1;
  mode: TrackMode;
  startedAt: number;
  endedAt: number;
  /** World-space origin captured at recording start (for coordinate display). */
  origin: { x: number; y: number; z: number };
  frames: TrackFrame[];
  laps: LapInfo[];
  positionChanges: PositionChange[];
}

/** Which telemetry field colours the path line. */
export type PathColorMetric = 'speed' | 'grip' | 'throttle' | 'brake';

export const PATH_COLOR_METRIC_LABELS: Record<PathColorMetric, string> = {
  speed: 'Speed',
  grip: 'Grip',
  throttle: 'Throttle',
  brake: 'Brake',
};
