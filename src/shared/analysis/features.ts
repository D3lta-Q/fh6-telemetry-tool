/**
 * Per-frame feature derivation, confound rejection, and corner-phase
 * segmentation for the Tune Refinement analysis.
 *
 * The analysis engine never touches raw packets directly — it works on the
 * `Frame[]` produced here. Centralising derivation means the diagnostics read
 * cleanly and every signal (driver inputs, yaw, sideslip, suspension, tyre
 * temps) is computed once, consistently.
 *
 * Confound rejection
 * ------------------
 * A car's behaviour is the product of BOTH the tune and the driver. To keep
 * driver inputs from being misread as tune faults we invalidate frames where
 * an artefact or input explains the behaviour:
 *   - collisions  : hard impulse with no brake (± guard window)
 *   - airborne    : all wheels drooped (jumps)
 *   - off-road    : loose surface (excluded on road tunes, kept on rally tunes)
 *   - handbrake   : a yank produces a rear slide that mimics power oversteer,
 *                   so handbrake frames + a short guard window are excluded
 *                   from grip/balance analysis.
 */

import type { TelemetryData } from '../telemetry';
import { G, isOffRoad, isAirborne, isCollisionImpulse } from './frameFlags';

/** Frames invalidated on each side of a detected collision (~1s @ 60Hz). */
export const COLLISION_GUARD = 60;
/** Handbrake fraction (0..1) above which the lever counts as engaged. */
export const HANDBRAKE_ON = 0.1;
/** Frames invalidated after a handbrake release (~0.5s) while the slide settles. */
export const HANDBRAKE_GUARD = 30;
/** Lateral g above which a frame counts as "cornering". */
export const CORNER_G = 0.3;
/** Normalised steering (|steer|, 0..1) above which the driver is "turning". */
export const STEER_TURNING = 0.08;
/** Normalised suspension travel (→1 = full compression) counted as bottoming. */
export const BOTTOMING_TRAVEL = 0.95;
/** Minimum corner length in frames (~0.2s) to be analysed. */
const MIN_CORNER_FRAMES = 12;
/** Bridge gaps up to this many non-turning frames within one corner. */
const CORNER_GAP_BRIDGE = 8;

export type CornerPhase = 'entry' | 'mid' | 'exit';

export interface Frame {
  d: TelemetryData;
  i: number;

  // --- Vehicle dynamics ---
  latG: number; // lateral g (accelerationX / G)
  longG: number; // longitudinal g (accelerationZ / G); <0 = braking
  speed: number; // m/s
  yawRate: number; // rad/s (raw angularVelocityY)
  sideslip: number; // rad, atan2(lateral vel, forward vel); large = sliding

  // --- Driver inputs ---
  throttle: number; // 0..1
  brake: number; // 0..1
  handbrake: number; // 0..1
  steer: number; // -1..1

  // --- Tyres (axle aggregates) ---
  frontSlipAngle: number; // mean |slip angle| front (rad)
  rearSlipAngle: number;
  frontLock: number; // mean |min(0, slip ratio)| front (braking lock-up)
  rearLock: number;
  frontSpin: number; // mean max(0, slip ratio) front (drive wheelspin, FWD/AWD)
  rearSpin: number; // mean max(0, slip ratio) rear (drive wheelspin, RWD/AWD)
  frontTemp: number; // mean °F front
  rearTemp: number; // mean °F rear

  // --- Suspension (normalised 0..1, 1 = full compression) ---
  suspFL: number;
  suspFR: number;
  suspRL: number;
  suspRR: number;

  // --- Classification ---
  offRoad: boolean;
  airborne: boolean;
  collision: boolean;
  handbrakeActive: boolean;
  valid: boolean;

  // --- Segmentation (filled by segmentCorners) ---
  cornerId: number; // -1 when not in a corner
  phase: CornerPhase | null;
}

function mean2(a: number, b: number): number {
  return (a + b) / 2;
}

/**
 * Build the per-frame feature list and apply confound rejection.
 * `looseTune` keeps off-road frames valid (rally/truck/buggy) instead of
 * discarding them.
 */
export function deriveFrames(packets: TelemetryData[], looseTune: boolean): Frame[] {
  const frames: Frame[] = packets.map((d, i) => {
    const fa = mean2(Math.abs(d.tireSlipAngleFrontLeft), Math.abs(d.tireSlipAngleFrontRight));
    const ra = mean2(Math.abs(d.tireSlipAngleRearLeft), Math.abs(d.tireSlipAngleRearRight));
    const fLock = mean2(
      Math.abs(Math.min(0, d.tireSlipRatioFrontLeft)),
      Math.abs(Math.min(0, d.tireSlipRatioFrontRight))
    );
    const rLock = mean2(
      Math.abs(Math.min(0, d.tireSlipRatioRearLeft)),
      Math.abs(Math.min(0, d.tireSlipRatioRearRight))
    );
    const fSpin = mean2(Math.max(0, d.tireSlipRatioFrontLeft), Math.max(0, d.tireSlipRatioFrontRight));
    const rSpin = mean2(Math.max(0, d.tireSlipRatioRearLeft), Math.max(0, d.tireSlipRatioRearRight));

    const handbrake = d.handBrake / 255;

    return {
      d,
      i,
      latG: d.accelerationX / G,
      longG: d.accelerationZ / G,
      speed: d.speed,
      yawRate: d.angularVelocityY,
      sideslip: Math.atan2(d.velocityX, Math.abs(d.velocityZ) < 1e-3 ? 1e-3 : d.velocityZ),
      throttle: d.accel / 255,
      brake: d.brake / 255,
      handbrake,
      steer: d.steer / 127,
      frontSlipAngle: fa,
      rearSlipAngle: ra,
      frontLock: fLock,
      rearLock: rLock,
      frontSpin: fSpin,
      rearSpin: rSpin,
      frontTemp: mean2(d.tireTempFrontLeft, d.tireTempFrontRight),
      rearTemp: mean2(d.tireTempRearLeft, d.tireTempRearRight),
      suspFL: d.normalizedSuspensionTravelFrontLeft,
      suspFR: d.normalizedSuspensionTravelFrontRight,
      suspRL: d.normalizedSuspensionTravelRearLeft,
      suspRR: d.normalizedSuspensionTravelRearRight,
      offRoad: isOffRoad(d),
      airborne: isAirborne(d),
      collision: isCollisionImpulse(d),
      handbrakeActive: handbrake > HANDBRAKE_ON,
      valid: true,
      cornerId: -1,
      phase: null,
    };
  });

  // Expand collisions into guard windows.
  const N = frames.length;
  for (let i = 0; i < N; i++) {
    if (isCollisionImpulse(frames[i].d)) {
      const lo = Math.max(0, i - COLLISION_GUARD);
      const hi = Math.min(N - 1, i + COLLISION_GUARD);
      for (let j = lo; j <= hi; j++) frames[j].collision = true;
    }
  }
  // Expand handbrake into a trailing guard window (the induced slide settles).
  for (let i = 0; i < N; i++) {
    if (frames[i].handbrake > HANDBRAKE_ON) {
      const hi = Math.min(N - 1, i + HANDBRAKE_GUARD);
      for (let j = i; j <= hi; j++) frames[j].handbrakeActive = true;
    }
  }

  for (const f of frames) {
    if (!f.d.isRaceOn) f.valid = false;
    else if (f.collision) f.valid = false;
    else if (f.airborne) f.valid = false;
    else if (f.handbrakeActive) f.valid = false;
    else if (f.offRoad && !looseTune) f.valid = false;
  }

  return frames;
}

function isTurning(f: Frame): boolean {
  return f.valid && (Math.abs(f.steer) > STEER_TURNING || Math.abs(f.latG) > CORNER_G);
}

/**
 * Group valid frames into corners and tag each frame's phase
 * (entry → braking/turn-in, mid → around the apex, exit → unwinding on power).
 * Returns the number of corners found.
 */
export function segmentCorners(frames: Frame[]): number {
  const N = frames.length;
  let cornerId = 0;
  let i = 0;

  while (i < N) {
    if (!isTurning(frames[i])) {
      i++;
      continue;
    }
    // Extend the corner, bridging short gaps of non-turning frames.
    let end = i;
    let gap = 0;
    for (let j = i + 1; j < N; j++) {
      if (isTurning(frames[j])) {
        end = j;
        gap = 0;
      } else if (++gap > CORNER_GAP_BRIDGE) {
        break;
      }
    }

    const len = end - i + 1;
    const hasRealCorner = frames.slice(i, end + 1).some((f) => Math.abs(f.latG) > CORNER_G);
    if (len >= MIN_CORNER_FRAMES && hasRealCorner) {
      assignPhases(frames, i, end, cornerId);
      cornerId++;
    }
    i = end + 1;
  }

  return cornerId;
}

function assignPhases(frames: Frame[], start: number, end: number, cornerId: number): void {
  // Apex = minimum-speed frame within the corner.
  let apex = start;
  let minSpeed = Infinity;
  for (let k = start; k <= end; k++) {
    if (frames[k].speed < minSpeed) {
      minSpeed = frames[k].speed;
      apex = k;
    }
  }
  const apexWin = 5; // frames each side of the apex forced to "mid"

  for (let k = start; k <= end; k++) {
    const f = frames[k];
    f.cornerId = cornerId;
    if (Math.abs(k - apex) <= apexWin) {
      f.phase = 'mid';
    } else if (k < apex && (f.brake > 0.15 || f.longG < -0.12)) {
      f.phase = 'entry';
    } else if (k > apex && f.throttle > 0.15) {
      f.phase = 'exit';
    } else {
      f.phase = 'mid';
    }
  }
}

// ---- small statistics helpers shared with the engine -------------------------

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const a = [...xs].sort((p, q) => p - q);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/** p in 0..1 */
export function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const a = [...xs].sort((q, r) => q - r);
  const idx = Math.min(a.length - 1, Math.max(0, Math.round(p * (a.length - 1))));
  return a[idx];
}
