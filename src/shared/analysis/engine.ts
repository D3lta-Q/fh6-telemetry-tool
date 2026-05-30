/**
 * Test-lap analysis engine (v2).
 *
 * Takes the raw telemetry packets recorded during a test lap, derives a clean
 * per-frame feature set, rejects driver/artefact confounds, segments the lap
 * into corners and corner phases, then runs a battery of physics-based
 * diagnostics that map onto concrete, bounded tune adjustments.
 *
 * Design philosophy
 * -----------------
 * This is a deterministic, interpretable, physics/heuristic engine — not an ML
 * model. Vehicle dynamics is a well-specified problem and there is no labelled
 * "telemetry → correct tune" dataset to train on, so hand-built diagnostics
 * with explicit reasoning beat a black box here. Every suggestion carries a
 * human-readable reason and a confidence level, and moves the value by a
 * modest, bounded step so refinement converges over several laps rather than
 * over-correcting on a single noisy one.
 *
 * Key signals (all derived in features.ts):
 *   - driver inputs (steer, throttle, brake, handbrake) for phase segmentation
 *     and confound rejection
 *   - steering-vs-yaw, cross-checked against axle slip-angle balance, for the
 *     headline understeer/oversteer call (with a confidence from their
 *     agreement)
 *   - sideslip + counter-steer for entry instability / snap oversteer
 *   - per-axle lock-up for brake bias
 *   - drive-wheel slip for corner-exit traction
 *   - suspension travel for bottoming-out
 *   - tyre-temperature balance to corroborate camber/pressure
 *   - rpm/gear for gearing advice
 */

import type { TelemetryData } from '../telemetry';
import { TuneType, Drivetrain } from '../tuning';
import type { TuneParam } from './params';
import {
  deriveFrames,
  segmentCorners,
  mean,
  median,
  percentile,
  BOTTOMING_TRAVEL,
  type Frame,
} from './features';

/** Brake fraction (0..1) above which a frame counts as "hard braking". */
const BRAKE_ON = 0.5;
/** Throttle fraction above which a frame counts as "on power" for exit. */
const THROTTLE_ON = 0.5;

export type Confidence = 'high' | 'medium' | 'low';

export interface AnalysisContext {
  tuneType: TuneType;
  drivetrain: Drivetrain;
}

export interface Suggestion {
  paramId: string;
  to: number;
  reason: string;
  confidence: Confidence;
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
    exitFrames: number;
    corners: number;
    excludedCollision: number;
    excludedAirborne: number;
    excludedOffRoad: number;
    excludedHandbrake: number;
  };
  findings: string[];
  suggestions: Suggestion[];
}

function isLooseSurfaceTune(t: TuneType): boolean {
  return t === TuneType.Rally || t === TuneType.Truck || t === TuneType.Buggy;
}

const CONF_SCALE: Record<Confidence, number> = { high: 1, medium: 0.6, low: 0.35 };

/**
 * Look up a parameter and produce a clamped suggestion moving it by `delta`,
 * scaled by confidence. Repeated nudges to the same parameter are merged and
 * keep the strongest confidence.
 */
function nudge(
  params: TuneParam[],
  id: string,
  delta: number,
  reason: string,
  confidence: Confidence,
  out: Suggestion[]
): void {
  const param = params.find((p) => p.id === id);
  if (!param || !param.adjustable) return;
  const scaled = delta * CONF_SCALE[confidence];
  const to = Math.min(param.max, Math.max(param.min, param.value + scaled));
  if (Math.abs(to - param.value) < 1e-6) return; // already at the rail
  const existing = out.find((s) => s.paramId === id);
  if (existing) {
    existing.to = to;
    if (CONF_SCALE[confidence] > CONF_SCALE[existing.confidence]) {
      existing.confidence = confidence;
      existing.reason = reason;
    }
  } else {
    out.push({ paramId: id, to, reason, confidence });
  }
}

/** Fraction of a parameter's range, used to scale spring nudges. */
function frac(params: TuneParam[], id: string, f: number): number {
  const p = params.find((x) => x.id === id);
  if (!p) return 0;
  return (p.max - p.min) * f;
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
    exitFrames: 0,
    corners: 0,
    excludedCollision: 0,
    excludedAirborne: 0,
    excludedOffRoad: 0,
    excludedHandbrake: 0,
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
  const frames = deriveFrames(packets, looseTune);
  stats.corners = segmentCorners(frames);

  for (const f of frames) {
    if (f.collision) stats.excludedCollision++;
    else if (f.airborne) stats.excludedAirborne++;
    else if (f.handbrakeActive) stats.excludedHandbrake++;
    else if (f.offRoad && !looseTune) stats.excludedOffRoad++;
    if (f.valid) stats.validFrames++;
  }

  // Phase buckets.
  const mid = frames.filter((f) => f.valid && f.phase === 'mid');
  const entry = frames.filter((f) => f.valid && f.phase === 'entry');
  const exit = frames.filter((f) => f.valid && f.phase === 'exit');
  const braking = frames.filter((f) => f.valid && f.brake > BRAKE_ON && f.longG < -0.2);
  stats.corneringFrames = mid.length;
  stats.brakingFrames = braking.length;
  stats.exitFrames = exit.length;

  const findings: string[] = [];
  const suggestions: Suggestion[] = [];

  if (mid.length < 30) {
    return {
      ok: false,
      reason:
        'Not enough clean cornering data. Drive a lap with several corners on the intended surface and avoid collisions and handbrake use.',
      stats,
      findings,
      suggestions,
    };
  }

  diagnoseBalance(mid, params, ctx, looseTune, findings, suggestions);
  diagnoseEntryStability(entry, frames, params, ctx, findings, suggestions);
  diagnoseBraking(braking, params, findings, suggestions);
  diagnoseExitTraction(exit, params, ctx, findings, suggestions);
  diagnoseTyreTemps(mid, findings);
  diagnoseSuspension(frames, params, findings, suggestions);
  if (looseTune) diagnoseLandings(frames, params, findings, suggestions);
  diagnoseGearing(frames, findings);

  if (suggestions.length === 0 && findings.length > 0) {
    findings.push('No confident changes from this lap. Drive 2–3 consistent laps for a stronger read.');
  }

  return { ok: true, stats, findings, suggestions };
}

// =============================================================================
// Diagnostics
// =============================================================================

/**
 * Headline handling balance, mid-corner.
 *
 * Two independent measures:
 *   1. Slip-angle balance: mean |front slip angle| − |rear slip angle|.
 *   2. Steering-vs-yaw: the car's actual yaw rate vs the yaw the steering
 *      commands. We can't know the game's steering ratio, so we self-calibrate
 *      a gain k = median(|yaw| / (|steer|·speed)) over cornering frames, then
 *      look at the limit (highest-latG frames): an understeering car
 *      under-rotates there (actual yaw below the calibrated expectation).
 *
 * Agreement between the two sets the confidence; disagreement → report only.
 */
function diagnoseBalance(
  mid: Frame[],
  params: TuneParam[],
  ctx: AnalysisContext,
  looseTune: boolean,
  findings: string[],
  suggestions: Suggestion[]
): void {
  // 1) slip-angle balance (radians; >0 understeer)
  const slipBalance = mean(mid.map((f) => f.frontSlipAngle)) - mean(mid.map((f) => f.rearSlipAngle));

  // 2) steering-vs-yaw at the limit
  const demandFrames = mid.filter((f) => Math.abs(f.steer) > 0.1 && f.speed > 8);
  let yawTendency = 0; // >0 understeer, <0 oversteer, normalized
  if (demandFrames.length >= 15) {
    const ratios = demandFrames.map((f) => Math.abs(f.yawRate) / (Math.abs(f.steer) * f.speed));
    const k = median(ratios.filter((r) => Number.isFinite(r) && r > 0));
    if (k > 0) {
      const latLimit = percentile(demandFrames.map((f) => Math.abs(f.latG)), 0.7);
      const limit = demandFrames.filter((f) => Math.abs(f.latG) >= latLimit);
      const residuals = limit.map((f) => {
        const expected = k * Math.abs(f.steer) * f.speed; // expected |yaw|
        const actual = Math.abs(f.yawRate);
        return (expected - actual) / (expected || 1); // >0 under-rotating
      });
      yawTendency = mean(residuals);
    }
  }

  const slipThresh = looseTune ? 0.05 : 0.025;
  const yawThresh = 0.06;
  const slipUnder = slipBalance > slipThresh;
  const slipOver = slipBalance < -slipThresh;
  const yawUnder = yawTendency > yawThresh;
  const yawOver = yawTendency < -yawThresh;

  const understeer = slipUnder || yawUnder;
  const oversteer = slipOver || yawOver;

  // Confidence from agreement between the two measures.
  const conf = (a: boolean, b: boolean): Confidence => {
    if (a && b) return 'high';
    // disagreement (one says under, the other over) → low
    if ((slipUnder && yawOver) || (slipOver && yawUnder)) return 'low';
    return 'medium';
  };

  if (understeer && !oversteer) {
    const c = conf(slipUnder, yawUnder);
    const sev = Math.min(2, 1 + Math.floor(Math.max(0, slipBalance - slipThresh) / slipThresh));
    findings.push(
      `Mid-corner understeer (front slips ${(slipBalance * (180 / Math.PI)).toFixed(1)}° more than rear` +
        `${yawUnder ? ', yaw response confirms' : ''}) — ${c} confidence. Freeing up the front.`
    );
    if (c === 'low') return; // measures disagree: report only, don't change the car
    nudge(params, 'arbFront', -4 * sev, 'Soften front ARB to reduce understeer', c, suggestions);
    nudge(params, 'springFront', -frac(params, 'springFront', 0.06 * sev), 'Soften front springs', c, suggestions);
    nudge(params, 'camberFront', -0.3 * sev, 'Add front negative camber for grip', c, suggestions);
    nudge(params, 'arbRear', +3 * sev, 'Stiffen rear ARB to help the car rotate', c, suggestions);
  } else if (oversteer && !understeer) {
    const c = conf(slipOver, yawOver);
    const sev = Math.min(2, 1 + Math.floor(Math.max(0, -slipBalance - slipThresh) / slipThresh));
    findings.push(
      `Mid-corner oversteer (rear slips ${(-slipBalance * (180 / Math.PI)).toFixed(1)}° more than front` +
        `${yawOver ? ', yaw response confirms' : ''}) — ${c} confidence. Stabilising the rear.`
    );
    if (c === 'low') return;
    nudge(params, 'arbRear', -4 * sev, 'Soften rear ARB to reduce oversteer', c, suggestions);
    nudge(params, 'springRear', -frac(params, 'springRear', 0.06 * sev), 'Soften rear springs', c, suggestions);
    nudge(params, 'arbFront', +3 * sev, 'Stiffen front ARB to settle the rear', c, suggestions);
    if (ctx.drivetrain !== Drivetrain.FWD) {
      nudge(params, 'diffRearAccel', -6 * sev, 'Reduce rear accel diff lock', c, suggestions);
    }
  } else {
    findings.push('Cornering balance looks neutral — no major understeer or oversteer.');
  }
}

/**
 * Corner-entry instability: rear stepping out on the brakes / turn-in.
 * Detected from sideslip building during entry and counter-steer corrections
 * (steering opposite the yaw direction while the rear is slipping).
 */
function diagnoseEntryStability(
  entry: Frame[],
  frames: Frame[],
  params: TuneParam[],
  ctx: AnalysisContext,
  findings: string[],
  suggestions: Suggestion[]
): void {
  if (entry.length < 15) return;

  const maxSideslip = percentile(entry.map((f) => Math.abs(f.sideslip)), 0.9);
  // Counter-steer: driver steering against the yaw while sliding (catching it).
  let counterSteer = 0;
  for (const f of entry) {
    if (Math.abs(f.steer) > 0.1 && Math.abs(f.yawRate) > 0.05 && Math.sign(f.steer) !== Math.sign(f.yawRate)) {
      counterSteer++;
    }
  }
  const counterFrac = counterSteer / entry.length;
  const rearLoose = mean(entry.map((f) => f.rearSlipAngle)) > mean(entry.map((f) => f.frontSlipAngle)) * 1.2;

  // ~0.13 rad ≈ 7.5° of sideslip on entry is getting lively.
  if (maxSideslip > 0.13 && (counterFrac > 0.06 || rearLoose)) {
    const c: Confidence = counterFrac > 0.12 ? 'high' : 'medium';
    findings.push(
      `Corner-entry instability — rear steps out under braking/turn-in ` +
        `(${(maxSideslip * (180 / Math.PI)).toFixed(0)}° sideslip, counter-steer on ${(counterFrac * 100).toFixed(0)}% of entry frames). ${c} confidence.`
    );
    nudge(params, 'brakeBalance', +3, 'Shift brake balance forward to steady entry', c, suggestions);
    nudge(params, 'bumpRear', -frac(params, 'bumpRear', 0.08), 'Soften rear bump for entry compliance', c, suggestions);
    if (ctx.drivetrain !== Drivetrain.FWD) {
      nudge(params, 'diffRearDecel', -5, 'Reduce rear deceleration diff lock for entry stability', c, suggestions);
    }
  }
}

/** Brake lock-up balance from per-axle negative slip ratio under hard braking. */
function diagnoseBraking(
  braking: Frame[],
  params: TuneParam[],
  findings: string[],
  suggestions: Suggestion[]
): void {
  if (braking.length < 20) return;
  const fLock = mean(braking.map((f) => f.frontLock));
  const rLock = mean(braking.map((f) => f.rearLock));

  if (fLock > rLock * 1.25 && fLock > 0.05) {
    const c: Confidence = fLock > rLock * 1.6 ? 'high' : 'medium';
    findings.push('Fronts lock before the rears under braking. Shifting brake balance rearward.');
    nudge(params, 'brakeBalance', -3, 'Move brake balance rearward to stop front lock-up', c, suggestions);
  } else if (rLock > fLock * 1.25 && rLock > 0.05) {
    const c: Confidence = rLock > fLock * 1.6 ? 'high' : 'medium';
    findings.push('Rears lock before the fronts under braking. Shifting brake balance forward.');
    nudge(params, 'brakeBalance', +3, 'Move brake balance forward to stop rear lock-up', c, suggestions);
  }
}

/** Corner-exit traction: drive-wheel spin on power. */
function diagnoseExitTraction(
  exit: Frame[],
  params: TuneParam[],
  ctx: AnalysisContext,
  findings: string[],
  suggestions: Suggestion[]
): void {
  const onPower = exit.filter((f) => f.throttle > THROTTLE_ON);
  if (onPower.length < 20) return;

  if (ctx.drivetrain !== Drivetrain.FWD) {
    const rearSpin = mean(onPower.map((f) => f.rearSpin));
    if (rearSpin > 0.12) {
      const c: Confidence = rearSpin > 0.2 ? 'high' : 'medium';
      findings.push('Rear wheelspin on corner exit. Reducing rear acceleration diff lock.');
      nudge(params, 'diffRearAccel', -8, 'Reduce rear accel diff lock to limit wheelspin', c, suggestions);
    }
  }
  if (ctx.drivetrain !== Drivetrain.RWD) {
    const frontSpin = mean(onPower.map((f) => f.frontSpin));
    if (frontSpin > 0.12) {
      const c: Confidence = frontSpin > 0.2 ? 'high' : 'medium';
      findings.push('Front wheelspin / scrabble on corner exit. Reducing front acceleration diff lock.');
      nudge(params, 'diffFrontAccel', -8, 'Reduce front accel diff lock to limit wheelspin', c, suggestions);
    }
  }
}

/**
 * Tyre-temperature balance. We get no live tyre pressure in the packet, so
 * pressure can't be tuned to a hot-pressure target; instead we use front/rear
 * temperature balance as a corroborating, informational signal. Left/right
 * imbalance is track-direction dependent and only reported.
 */
function diagnoseTyreTemps(mid: Frame[], findings: string[]): void {
  const f = mean(mid.map((x) => x.frontTemp));
  const r = mean(mid.map((x) => x.rearTemp));
  if (f <= 0 || r <= 0) return; // some cars/telemetry report 0
  const delta = f - r;
  if (Math.abs(delta) > 15) {
    const hotter = delta > 0 ? 'front' : 'rear';
    findings.push(
      `Tyre temperatures: ${hotter} axle running ${Math.abs(delta).toFixed(0)}°F hotter — that axle is working harder, consistent with the balance read above.`
    );
  }
}

/** Bottoming-out detection from normalised suspension travel. */
function diagnoseSuspension(
  frames: Frame[],
  params: TuneParam[],
  findings: string[],
  suggestions: Suggestion[]
): void {
  const valid = frames.filter((f) => f.valid && !f.airborne);
  if (valid.length < 60) return;

  const frontBottom = valid.filter((f) => f.suspFL > BOTTOMING_TRAVEL || f.suspFR > BOTTOMING_TRAVEL).length;
  const rearBottom = valid.filter((f) => f.suspRL > BOTTOMING_TRAVEL || f.suspRR > BOTTOMING_TRAVEL).length;
  const frontFrac = frontBottom / valid.length;
  const rearFrac = rearBottom / valid.length;

  if (frontFrac > 0.03) {
    const c: Confidence = frontFrac > 0.08 ? 'high' : 'medium';
    findings.push(`Front suspension bottoming out (${(frontFrac * 100).toFixed(0)}% of frames). Stiffening front bump.`);
    nudge(params, 'bumpFront', +frac(params, 'bumpFront', 0.1), 'Stiffen front bump to stop bottoming', c, suggestions);
    if (frontFrac > 0.08) nudge(params, 'rideHeightFront', +1, 'Raise front ride height to stop bottoming', c, suggestions);
  }
  if (rearFrac > 0.03) {
    const c: Confidence = rearFrac > 0.08 ? 'high' : 'medium';
    findings.push(`Rear suspension bottoming out (${(rearFrac * 100).toFixed(0)}% of frames). Stiffening rear bump.`);
    nudge(params, 'bumpRear', +frac(params, 'bumpRear', 0.1), 'Stiffen rear bump to stop bottoming', c, suggestions);
    if (rearFrac > 0.08) nudge(params, 'rideHeightRear', +1, 'Raise rear ride height to stop bottoming', c, suggestions);
  }
}

/**
 * Landing recovery for loose-surface tunes: how long the car takes to settle
 * (combined slip drops to a stable level) after each jump.
 */
function diagnoseLandings(
  frames: Frame[],
  params: TuneParam[],
  findings: string[],
  suggestions: Suggestion[]
): void {
  let count = 0;
  let totalRecovery = 0;
  for (let i = 1; i < frames.length; i++) {
    if (!(frames[i - 1].airborne && !frames[i].airborne)) continue;
    count++;
    let j = i;
    const limit = Math.min(frames.length, i + 180); // cap ~3s
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
  const avg = count > 0 ? totalRecovery / count : 0;
  if (count >= 2 && avg > 30) {
    findings.push(`Slow recovery after ${count} jump landings (~${(avg / 60).toFixed(1)}s). Softening rebound to settle faster.`);
    nudge(params, 'reboundFront', -2, 'Soften front rebound for better landings', 'medium', suggestions);
    nudge(params, 'reboundRear', -2, 'Soften rear rebound for better landings', 'medium', suggestions);
  }
}

/**
 * Gearing advice. The calculated gear ratios are read-only in the refinement
 * model, so this emits findings only (no nudges) — but the rev-limiter and
 * shift-RPM reads are genuinely useful.
 */
function diagnoseGearing(frames: Frame[], findings: string[]): void {
  const racing = frames.filter((f) => f.valid && f.d.engineMaxRpm > 0);
  if (racing.length < 120) return;

  // Rev limiter: at/above redline while at high speed and on throttle.
  const maxRpm = median(racing.map((f) => f.d.engineMaxRpm));
  const topSpeed = percentile(racing.map((f) => f.speed), 0.95);
  const limiter = racing.filter(
    (f) => f.d.currentEngineRpm >= maxRpm * 0.995 && f.speed > topSpeed * 0.9 && f.throttle > 0.8
  ).length;
  if (limiter / 60 > 0.75) {
    findings.push(
      `Hitting the rev limiter on the straight (~${(limiter / 60).toFixed(1)}s near top speed). A longer final drive would let it pull further.`
    );
  }

  // Upshift RPM drop: large drops landing low in the range suggest tall gaps.
  let bigDrops = 0;
  let shifts = 0;
  for (let i = 1; i < racing.length; i++) {
    if (racing[i].d.gear > racing[i - 1].d.gear && racing[i - 1].d.gear > 0) {
      shifts++;
      const after = racing[Math.min(racing.length - 1, i + 6)].d.currentEngineRpm;
      if (after < maxRpm * 0.6) bigDrops++;
    }
  }
  if (shifts >= 4 && bigDrops / shifts > 0.5) {
    findings.push('Revs drop low after upshifts — gears are spaced tall, costing acceleration. Consider a shorter final drive or closer ratios.');
  }
}
