/**
 * Test-lap analysis engine.
 *
 * Takes the raw telemetry packets recorded during a test lap, validates and
 * segments them, derives handling diagnostics, and maps those diagnostics onto
 * concrete adjustments to the current tune's parameters.
 *
 * Design notes (from the feature discussion):
 *  - We compare *events*, not whole laps. Diagnostics are aggregated over all
 *    valid cornering / braking / corner-exit / landing frames in the recording.
 *  - Frames are validated before analysis so artefacts can't poison the result:
 *      • collisions  — a near-instant deceleration impulse with little/no brake
 *      • airborne    — all four wheels fully drooped (jumps)
 *      • off-road    — surfaceRumble on a road tune (excluded); on a rally /
 *                      off-road tune it's expected and kept as loose-surface
 *                      context with relaxed slip thresholds.
 *  - Suggestions move values by modest, bounded steps so refinement converges
 *    iteratively rather than over-correcting on a single noisy lap.
 */

import type { TelemetryData } from '../telemetry';
import { TuneType, Drivetrain } from '../tuning';
import type { TuneParam } from './params';

const G = 9.807; // m/s² per g

/** Lateral g above which a frame counts as "cornering". */
const CORNER_G = 0.3;
/** Single-frame |g| treated as a collision impulse when brake is not applied. */
const COLLISION_G = 2.6;
/** Frames invalidated on each side of a detected collision (~1s @ 60Hz). */
const COLLISION_GUARD = 60;
/** Brake fraction (0..1) above which a frame counts as "hard braking". */
const BRAKE_ON = 0.5;
/** Throttle fraction (0..1) above which a frame counts as "on power". */
const THROTTLE_ON = 0.6;

export interface AnalysisContext {
  tuneType: TuneType;
  drivetrain: Drivetrain;
}

export interface Suggestion {
  paramId: string;
  to: number;
  reason: string;
}

export interface TestLapResult {
  ok: boolean;
  /** Populated when analysis can't run (too little usable data). */
  reason?: string;
  stats: {
    totalFrames: number;
    validFrames: number;
    corneringFrames: number;
    brakingFrames: number;
    excludedCollision: number;
    excludedAirborne: number;
    excludedOffRoad: number;
  };
  findings: string[];
  suggestions: Suggestion[];
}

interface Frame {
  d: TelemetryData;
  latG: number;
  longG: number;
  brake: number; // 0..1
  throttle: number; // 0..1
  offRoad: boolean;
  airborne: boolean;
  collision: boolean;
  valid: boolean;
}

function maxSurfaceRumble(d: TelemetryData): number {
  return Math.max(
    d.surfaceRumbleFrontLeft,
    d.surfaceRumbleFrontRight,
    d.surfaceRumbleRearLeft,
    d.surfaceRumbleRearRight
  );
}

function allWheelsDrooped(d: TelemetryData): boolean {
  return (
    d.normalizedSuspensionTravelFrontLeft < 0.05 &&
    d.normalizedSuspensionTravelFrontRight < 0.05 &&
    d.normalizedSuspensionTravelRearLeft < 0.05 &&
    d.normalizedSuspensionTravelRearRight < 0.05
  );
}

function isLooseSurfaceTune(t: TuneType): boolean {
  return t === TuneType.Rally || t === TuneType.Truck || t === TuneType.Buggy;
}

/** Build the per-frame context, including collision-guard windows. */
function buildFrames(packets: TelemetryData[], ctx: AnalysisContext): Frame[] {
  const looseTune = isLooseSurfaceTune(ctx.tuneType);

  const frames: Frame[] = packets.map((d) => {
    const latG = d.accelerationX / G;
    const longG = d.accelerationZ / G;
    const brake = d.brake / 255;
    const throttle = d.accel / 255;
    const offRoad = maxSurfaceRumble(d) > 0.15;
    const airborne = allWheelsDrooped(d);
    // Collision: a hard impulse in any axis without a matching brake input.
    const impulse = Math.max(Math.abs(latG), Math.abs(longG));
    const collision = impulse > COLLISION_G && brake < 0.3;
    return { d, latG, longG, brake, throttle, offRoad, airborne, collision, valid: true };
  });

  // Expand collisions into guard windows; airborne and (road-tune) off-road
  // frames are invalid.
  for (let i = 0; i < frames.length; i++) {
    if (frames[i].collision) {
      const lo = Math.max(0, i - COLLISION_GUARD);
      const hi = Math.min(frames.length - 1, i + COLLISION_GUARD);
      for (let j = lo; j <= hi; j++) frames[j].collision = true;
    }
  }
  for (const f of frames) {
    if (!f.d.isRaceOn) f.valid = false;
    if (f.collision) f.valid = false;
    if (f.airborne) f.valid = false;
    if (f.offRoad && !looseTune) f.valid = false;
  }
  return frames;
}

/** Look up a parameter and produce a clamped suggestion moving it by `delta`. */
function nudge(
  params: TuneParam[],
  id: string,
  delta: number,
  reason: string,
  out: Suggestion[]
): void {
  const param = params.find((p) => p.id === id);
  if (!param || !param.adjustable) return;
  const to = Math.min(param.max, Math.max(param.min, param.value + delta));
  if (Math.abs(to - param.value) < 1e-6) return; // already at the rail
  // Merge repeated nudges to the same parameter.
  const existing = out.find((s) => s.paramId === id);
  if (existing) {
    existing.to = to;
  } else {
    out.push({ paramId: id, to, reason });
  }
}

export function analyzeTestLap(
  packets: TelemetryData[],
  params: TuneParam[],
  ctx: AnalysisContext
): TestLapResult {
  const stats: TestLapResult['stats'] = {
    totalFrames: packets.length,
    validFrames: 0,
    corneringFrames: 0,
    brakingFrames: 0,
    excludedCollision: 0,
    excludedAirborne: 0,
    excludedOffRoad: 0,
  };

  if (packets.length < 120) {
    return {
      ok: false,
      reason: 'Recording too short — drive a longer test lap with some corners and braking.',
      stats,
      findings: [],
      suggestions: [],
    };
  }

  const looseTune = isLooseSurfaceTune(ctx.tuneType);
  const frames = buildFrames(packets, ctx);

  for (const f of frames) {
    if (f.collision) stats.excludedCollision++;
    if (f.airborne) stats.excludedAirborne++;
    if (f.offRoad && !looseTune) stats.excludedOffRoad++;
    if (f.valid) stats.validFrames++;
  }

  const cornering = frames.filter((f) => f.valid && Math.abs(f.latG) > CORNER_G);
  const braking = frames.filter((f) => f.valid && f.brake > BRAKE_ON && f.longG < -0.2);
  const exit = frames.filter((f) => f.valid && f.throttle > THROTTLE_ON && Math.abs(f.latG) > 0.2);
  stats.corneringFrames = cornering.length;
  stats.brakingFrames = braking.length;

  const findings: string[] = [];
  const suggestions: Suggestion[] = [];

  if (cornering.length < 30) {
    return {
      ok: false,
      reason:
        'Not enough clean cornering data. Drive a lap with several corners on the intended surface and avoid collisions.',
      stats,
      findings,
      suggestions,
    };
  }

  // --- Handling balance (understeer / oversteer) ---------------------------
  // Compare mean absolute slip ANGLE between axles during cornering. A front
  // axle that slips more than the rear is plowing (understeer); the reverse is
  // oversteer. Loose-surface tunes tolerate more slip before we react.
  let fSlip = 0;
  let rSlip = 0;
  for (const f of cornering) {
    fSlip += (Math.abs(f.d.tireSlipAngleFrontLeft) + Math.abs(f.d.tireSlipAngleFrontRight)) / 2;
    rSlip += (Math.abs(f.d.tireSlipAngleRearLeft) + Math.abs(f.d.tireSlipAngleRearRight)) / 2;
  }
  fSlip /= cornering.length;
  rSlip /= cornering.length;
  const balance = fSlip - rSlip; // radians; >0 understeer, <0 oversteer
  const balThreshold = looseTune ? 0.05 : 0.025;

  if (balance > balThreshold) {
    const sev = Math.min(2, Math.ceil((balance - balThreshold) / balThreshold));
    findings.push(
      `Mid-corner understeer detected (front slipping ${(balance * (180 / Math.PI)).toFixed(1)}° more than rear). Freeing up the front end.`
    );
    nudge(params, 'arbFront', -4 * sev, 'Soften front ARB to reduce understeer', suggestions);
    nudge(params, 'springFront', -frac(params, 'springFront', 0.06 * sev), 'Soften front springs', suggestions);
    nudge(params, 'camberFront', -0.3 * sev, 'Add front negative camber for grip', suggestions);
    nudge(params, 'arbRear', +3 * sev, 'Stiffen rear ARB to rotate the car', suggestions);
  } else if (balance < -balThreshold) {
    const sev = Math.min(2, Math.ceil((-balance - balThreshold) / balThreshold));
    findings.push(
      `Mid-corner oversteer detected (rear slipping ${(-balance * (180 / Math.PI)).toFixed(1)}° more than front). Stabilising the rear.`
    );
    nudge(params, 'arbRear', -4 * sev, 'Soften rear ARB to reduce oversteer', suggestions);
    nudge(params, 'springRear', -frac(params, 'springRear', 0.06 * sev), 'Soften rear springs', suggestions);
    nudge(params, 'arbFront', +3 * sev, 'Stiffen front ARB to settle the rear', suggestions);
    if (ctx.drivetrain !== Drivetrain.FWD) {
      nudge(params, 'diffRearAccel', -6 * sev, 'Reduce rear accel diff lock', suggestions);
    }
  } else {
    findings.push('Cornering balance looks neutral — no major understeer or oversteer.');
  }

  // --- Brake bias (lock-up balance) ----------------------------------------
  if (braking.length >= 20) {
    let fLock = 0;
    let rLock = 0;
    for (const f of braking) {
      // Under braking the longitudinal slip ratio goes negative; magnitude is
      // how close that wheel is to locking.
      fLock += (Math.abs(Math.min(0, f.d.tireSlipRatioFrontLeft)) + Math.abs(Math.min(0, f.d.tireSlipRatioFrontRight))) / 2;
      rLock += (Math.abs(Math.min(0, f.d.tireSlipRatioRearLeft)) + Math.abs(Math.min(0, f.d.tireSlipRatioRearRight))) / 2;
    }
    fLock /= braking.length;
    rLock /= braking.length;
    if (fLock > rLock * 1.25 && fLock > 0.05) {
      findings.push('Fronts lock before the rears under braking. Shifting brake balance rearward.');
      nudge(params, 'brakeBalance', -3, 'Move brake balance rearward to stop front lock-up', suggestions);
    } else if (rLock > fLock * 1.25 && rLock > 0.05) {
      findings.push('Rears lock before the fronts under braking. Shifting brake balance forward.');
      nudge(params, 'brakeBalance', +3, 'Move brake balance forward to stop rear lock-up', suggestions);
    }
  }

  // --- Corner-exit traction (power oversteer / wheelspin) ------------------
  if (exit.length >= 20 && ctx.drivetrain !== Drivetrain.FWD) {
    let rearSpin = 0;
    for (const f of exit) {
      rearSpin += (Math.max(0, f.d.tireSlipRatioRearLeft) + Math.max(0, f.d.tireSlipRatioRearRight)) / 2;
    }
    rearSpin /= exit.length;
    if (rearSpin > 0.12) {
      findings.push('Rear wheelspin on corner exit. Reducing rear acceleration diff lock.');
      nudge(params, 'diffRearAccel', -8, 'Reduce rear accel diff lock to limit wheelspin', suggestions);
    }
  }

  // --- Landing recovery (loose-surface tunes only) -------------------------
  if (looseTune) {
    const transitions = countLandings(frames);
    if (transitions.count >= 2 && transitions.avgRecoveryFrames > 30) {
      findings.push(
        `Slow recovery after ${transitions.count} jump landings. Softening rebound damping to settle the car faster.`
      );
      nudge(params, 'reboundFront', -2, 'Soften front rebound for better landings', suggestions);
      nudge(params, 'reboundRear', -2, 'Soften rear rebound for better landings', suggestions);
    }
  }

  if (suggestions.length === 0 && findings.length > 0) {
    findings.push('Current tune is already well balanced for this test — no changes suggested.');
  }

  return { ok: true, stats, findings, suggestions };
}

/** Fraction of a parameter's range, used to scale spring nudges. */
function frac(params: TuneParam[], id: string, f: number): number {
  const p = params.find((x) => x.id === id);
  if (!p) return 0;
  return (p.max - p.min) * f;
}

/**
 * Detect airborne→grounded transitions and estimate how long the car takes to
 * settle (grip returns to a stable baseline) after each landing.
 */
function countLandings(frames: Frame[]): { count: number; avgRecoveryFrames: number } {
  let count = 0;
  let totalRecovery = 0;
  for (let i = 1; i < frames.length; i++) {
    const justLanded = frames[i - 1].airborne && !frames[i].airborne;
    if (!justLanded) continue;
    count++;
    // Recovery = frames until combined slip drops back below a settled level.
    let j = i;
    const limit = Math.min(frames.length, i + 180); // cap at ~3s
    while (j < limit) {
      const d = frames[j].d;
      const slip =
        (d.tireCombinedSlipFrontLeft +
          d.tireCombinedSlipFrontRight +
          d.tireCombinedSlipRearLeft +
          d.tireCombinedSlipRearRight) /
        4;
      if (slip < 0.6) break;
      j++;
    }
    totalRecovery += j - i;
  }
  return { count, avgRecoveryFrames: count > 0 ? totalRecovery / count : 0 };
}
