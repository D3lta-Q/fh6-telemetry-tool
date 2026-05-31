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
/** Signed line-curvature (1/m) a corner must reach somewhere to count (radius < 250 m). */
const CORNER_ENTER_K = 0.004;
/** Curvature (1/m) a corner is held together above, with hysteresis (radius < ~450 m). */
const CORNER_STAY_K = 0.0022;
/** Same-direction corners separated by less than this arc length (m) are merged. */
const CORNER_BRIDGE_DIST = 30;
/** Minimum total heading change (rad, ~23°) for a run to count as a real corner. */
const CORNER_MIN_TURN = 0.4;

// ---- path-geometry tuning ----------------------------------------------------
/** Target half-window arc length (m) for the curvature estimate. */
const CURV_SPAN = 4;
/** Below this windowed span (m) the curvature estimate is unreliable → 0. */
const CURV_MIN_SPAN = 1.5;
/** Frame cap on each side of the curvature window (guards low-speed frames). */
const CURV_MAX_FRAMES = 30;
/** ± frames of moving-average smoothing applied to raw curvature. */
const CURV_SMOOTH = 4;
/** Curvatures flatter than this radius (m) are treated as straight. */
const MAX_RADIUS = 1000;
/** Fraction of peak curvature that still counts as the apex ("mid") zone. */
const MID_CURV_FRAC = 0.55;
/** Apex positions within this distance (m) are taken to be the same corner. */
const CORNER_MATCH_DIST = 30;

export type CornerPhase = 'entry' | 'mid' | 'exit';

/**
 * One detected corner, with the world-space geometry needed to reason about it
 * across laps. `clusterId`/`instances` link repeats of the same physical corner
 * (matched by apex position) so the engine can tell a persistent tune fault
 * from a one-off driver moment.
 */
export interface Corner {
  id: number;
  start: number; // first frame index (inclusive)
  end: number; // last frame index (inclusive)
  apex: number; // frame index of the geometric apex (peak curvature)
  apexPosX: number;
  apexPosZ: number;
  direction: number; // +1 left-hand, -1 right-hand
  radius: number; // m at the apex (tightness of the line)
  clusterId: number; // same physical corner across laps shares a cluster id
  instances: number; // number of corners in this corner's cluster (≥1)
}

export interface Frame {
  d: TelemetryData;
  i: number;

  // --- Vehicle dynamics ---
  latG: number; // lateral g (accelerationX / G)
  longG: number; // longitudinal g (accelerationZ / G); <0 = braking
  speed: number; // m/s
  yawRate: number; // rad/s (raw angularVelocityY)
  sideslip: number; // rad, atan2(lateral vel, forward vel); large = sliding

  // --- Path geometry (world frame, filled by computeGeometry) ---
  posX: number; // world position (m)
  posZ: number;
  course: number; // rad, world-space travel direction of the driven line
  curvature: number; // signed 1/m of the driven line (+left-hand, -right-hand)
  radius: number; // m, 1/|curvature| capped at MAX_RADIUS

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
      posX: d.positionX,
      posZ: d.positionZ,
      course: 0,
      curvature: 0,
      radius: MAX_RADIUS,
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

  computeGeometry(frames);

  return frames;
}

/**
 * Fill per-frame path geometry from world position: travel course, signed line
 * curvature (1/m) and radius.
 *
 * Curvature uses a three-point (Menger) estimate over an arc-length window, so
 * it reflects the *racing line the car actually traced* — not the chassis yaw,
 * which diverges from the line whenever the car slides. That distinction is the
 * whole point: it lets corner segmentation find the true geometric apex (the
 * tightest point of the line) independently of what the driver is doing with
 * the throttle and brake, instead of guessing the apex from minimum speed.
 */
function computeGeometry(frames: Frame[]): void {
  const N = frames.length;
  if (N < 3) return;

  // Cumulative planar arc length in the world X-Z plane.
  const s = new Array<number>(N).fill(0);
  for (let i = 1; i < N; i++) {
    const dx = frames[i].posX - frames[i - 1].posX;
    const dz = frames[i].posZ - frames[i - 1].posZ;
    s[i] = s[i - 1] + Math.hypot(dx, dz);
  }

  const rawK = new Array<number>(N).fill(0);
  for (let i = 0; i < N; i++) {
    // Expand a symmetric window until it spans ~CURV_SPAN of track on each side
    // (or hits the frame cap). Wide enough to be stable, short enough to track
    // a real corner; the frame cap stops near-stationary frames from spanning
    // the whole lap.
    let lo = i;
    while (lo > 0 && s[i] - s[lo] < CURV_SPAN && i - lo < CURV_MAX_FRAMES) lo--;
    let hi = i;
    while (hi < N - 1 && s[hi] - s[i] < CURV_SPAN && hi - i < CURV_MAX_FRAMES) hi++;
    if (hi - lo < 2 || s[hi] - s[lo] < CURV_MIN_SPAN) continue;

    const ax = frames[lo].posX;
    const az = frames[lo].posZ;
    const bx = frames[i].posX;
    const bz = frames[i].posZ;
    const cx = frames[hi].posX;
    const cz = frames[hi].posZ;
    const ab = Math.hypot(bx - ax, bz - az);
    const bc = Math.hypot(cx - bx, cz - bz);
    const ca = Math.hypot(ax - cx, az - cz);
    const denom = ab * bc * ca;
    if (denom < 1e-6) continue;
    // Twice the signed area of triangle ABC (X-Z plane) over the side-length
    // product is the Menger curvature; the sign gives the turn direction.
    const cross = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
    rawK[i] = (2 * cross) / denom;
    frames[i].course = Math.atan2(cx - ax, cz - az);
  }

  // Smooth curvature with a short moving average to tame 60 Hz position noise.
  for (let i = 0; i < N; i++) {
    let sum = 0;
    let n = 0;
    const lo = Math.max(0, i - CURV_SMOOTH);
    const hi = Math.min(N - 1, i + CURV_SMOOTH);
    for (let j = lo; j <= hi; j++) {
      sum += rawK[j];
      n++;
    }
    const k = n ? sum / n : 0;
    frames[i].curvature = k;
    frames[i].radius = Math.abs(k) > 1 / MAX_RADIUS ? 1 / Math.abs(k) : MAX_RADIUS;
  }
}

/**
 * Group frames into corners from the driven line's curvature, then tag each
 * frame's phase (entry → turn-in, mid → around the geometric apex, exit →
 * unwinding on power) and link repeats of the same physical corner across laps.
 *
 * Detection works on the smoothed signed curvature (1/m) rather than steering or
 * lateral g, so it reflects the line the car actually traced and is not fooled
 * by steering corrections on a straight. It uses:
 *   - hysteresis: a run is held together while |curvature| stays above STAY_K
 *     but only counts if it reaches the tighter ENTER_K somewhere;
 *   - direction splitting: a run breaks when the curvature sign flips, so an
 *     esse / chicane becomes separate corners;
 *   - distance merging: two same-direction runs split by a short near-straight
 *     (e.g. a momentary steering unwind mid-corner) are merged back together;
 *   - a minimum total heading change, which rejects brief twitches that never
 *     actually turn the car.
 */
export function segmentCorners(frames: Frame[]): Corner[] {
  const N = frames.length;
  if (N < 3) return [];

  // Per-step arc length in the world X-Z plane (for merge gaps and turn angle).
  const ds = new Float64Array(N);
  const s = new Float64Array(N);
  for (let i = 1; i < N; i++) {
    ds[i] = Math.hypot(frames[i].posX - frames[i - 1].posX, frames[i].posZ - frames[i - 1].posZ);
    s[i] = s[i - 1] + ds[i];
  }

  // Pass 1 — raw runs above STAY_K, broken whenever the turn direction flips.
  interface Run { start: number; end: number; sign: number; peak: number }
  const runs: Run[] = [];
  let i = 0;
  while (i < N) {
    if (Math.abs(frames[i].curvature) <= CORNER_STAY_K) { i++; continue; }
    const sign = Math.sign(frames[i].curvature);
    let end = i;
    let peak = Math.abs(frames[i].curvature);
    for (let j = i + 1; j < N; j++) {
      const k = frames[j].curvature;
      if (Math.abs(k) <= CORNER_STAY_K || Math.sign(k) !== sign) break;
      end = j;
      if (Math.abs(k) > peak) peak = Math.abs(k);
    }
    runs.push({ start: i, end, sign, peak });
    i = end + 1;
  }

  // Pass 2 — drop runs that never get tight enough (hysteresis).
  const tight = runs.filter((r) => r.peak >= CORNER_ENTER_K);

  // Pass 3 — merge same-direction runs separated by a short near-straight.
  const merged: Run[] = [];
  for (const r of tight) {
    const last = merged[merged.length - 1];
    if (last && last.sign === r.sign && s[r.start] - s[last.end] < CORNER_BRIDGE_DIST) {
      last.end = r.end;
      last.peak = Math.max(last.peak, r.peak);
    } else {
      merged.push({ ...r });
    }
  }

  // Pass 4 — keep runs that are long enough and actually change heading.
  const corners: Corner[] = [];
  for (const r of merged) {
    if (r.end - r.start + 1 < MIN_CORNER_FRAMES) continue;
    let turn = 0;
    for (let k = r.start + 1; k <= r.end; k++) turn += frames[k].curvature * ds[k];
    if (Math.abs(turn) < CORNER_MIN_TURN) continue;
    corners.push(buildCorner(frames, r.start, r.end, corners.length));
  }

  clusterCorners(corners);
  return corners;
}

/** Tag a corner's frames with phase and return its geometry summary. */
function buildCorner(frames: Frame[], start: number, end: number, id: number): Corner {
  // Apex = peak |curvature| (tightest point of the driven line).
  let apex = start;
  let peakK = 0;
  for (let k = start; k <= end; k++) {
    const ak = Math.abs(frames[k].curvature);
    if (ak > peakK) { peakK = ak; apex = k; }
  }

  // Mid = one contiguous band around the apex where curvature stays high. Growing
  // outward from the apex (rather than thresholding each frame independently)
  // guarantees a single mid block, so the overlay shows one green and one yellow
  // segment per corner instead of fragmenting on curvature noise.
  const midK = peakK * MID_CURV_FRAC;
  let midStart = apex;
  let midEnd = apex;
  while (midStart > start && Math.abs(frames[midStart - 1].curvature) >= midK) midStart--;
  while (midEnd < end && Math.abs(frames[midEnd + 1].curvature) >= midK) midEnd++;

  for (let k = start; k <= end; k++) {
    const f = frames[k];
    f.cornerId = id;
    if (k < midStart) f.phase = 'entry';
    else if (k > midEnd) f.phase = 'exit';
    else f.phase = 'mid';
  }

  return {
    id,
    start,
    end,
    apex,
    apexPosX: frames[apex].posX,
    apexPosZ: frames[apex].posZ,
    direction: Math.sign(frames[apex].curvature) || 1,
    radius: frames[apex].radius,
    clusterId: -1,
    instances: 1,
  };
}

/**
 * Link corners that share an apex location (within CORNER_MATCH_DIST) into
 * clusters — i.e. the same physical corner taken on different laps. Each
 * corner's `instances` then reports how many times that corner was driven,
 * which the engine uses to separate a persistent tune fault from a one-off.
 */
function clusterCorners(corners: Corner[]): void {
  const centroids: { x: number; z: number; n: number }[] = [];
  for (const c of corners) {
    let best = -1;
    let bestD = CORNER_MATCH_DIST;
    for (let ci = 0; ci < centroids.length; ci++) {
      const ce = centroids[ci];
      const d = Math.hypot(c.apexPosX - ce.x, c.apexPosZ - ce.z);
      if (d < bestD) {
        bestD = d;
        best = ci;
      }
    }
    if (best >= 0) {
      const ce = centroids[best];
      ce.x = (ce.x * ce.n + c.apexPosX) / (ce.n + 1);
      ce.z = (ce.z * ce.n + c.apexPosZ) / (ce.n + 1);
      ce.n++;
      c.clusterId = best;
    } else {
      c.clusterId = centroids.length;
      centroids.push({ x: c.apexPosX, z: c.apexPosZ, n: 1 });
    }
  }
  for (const c of corners) c.instances = centroids[c.clusterId]?.n ?? 1;
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
