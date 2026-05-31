/**
 * Tune calculator — a faithful port of the ForzaTune Pro engine, specialised
 * to the Forza Horizon 5 code path (the closest available match for FH6).
 *
 * The engine runs internally in metric mode (weight in kg); every output value
 * carries both English and metric figures, so the UI can render whichever unit
 * the user selects without re-running the calculation.
 *
 * Advanced "balance" modifiers (overall/turn-entry/turn-exit/ride/roll) are
 * fixed at their neutral default of 100, matching the app's baseline tune.
 */

import { Drivetrain, TuneType, EngineLocation, DamperType } from './enums';
import type { Surface } from './surfaces';
import {
  PressureValue,
  CamberValue,
  ToeValue,
  CasterValue,
  SpringValue,
  RideHeightValue,
  DampingValue,
  SwayBarValue,
  BrakeValue,
  DifferentialValue,
  Differentials,
  AeroValue,
} from './values';
import { GearCalculator, type GearingRequest, type GearResult } from './gearing';

/** Physical dimensions of a car, in metres, plus engine placement. */
export interface CarGeometry {
  length: number;
  width: number;
  height: number;
  wheelbase: number;
  frontTrack: number;
  rearTrack: number;
  engineLocation: EngineLocation;
}

export interface TuneRequest {
  /** Car weight in kilograms. */
  weightKg: number;
  /** Front weight distribution, percent (e.g. 52). */
  percentFront: number;
  performanceIndex: number;
  drivetrain: Drivetrain;
  tuneType: TuneType;
  surface: Surface;
  geometry: CarGeometry;
  /** Optional gearing inputs; when present, gear ratios are calculated. */
  gearing?: GearingRequest;
}

export interface TuneResult {
  tires: { front: PressureValue; rear: PressureValue };
  alignment: {
    frontCamber: CamberValue;
    rearCamber: CamberValue;
    frontToe: ToeValue;
    rearToe: ToeValue;
    caster: CasterValue;
  };
  springs: { front: SpringValue; rear: SpringValue; rideHeight: RideHeightValue };
  damping: {
    frontBump: DampingValue;
    rearBump: DampingValue;
    frontRebound: DampingValue;
    rearRebound: DampingValue;
  };
  swayBars: { front: SwayBarValue; rear: SwayBarValue };
  brakes: BrakeValue;
  differentials: Differentials;
  aero: { message: string; frontLabel: string; rearLabel: string; frontValue: number; rearValue: number };
  gears?: GearResult;
}

const TUNE_MODIFIER_DEFAULT = 100;

export class TuneCalculator {
  // Offsets / scratch state mirroring the source engine.
  private o1 = 1;
  private o2 = 1;
  private o3 = 0;
  private o4 = 0;
  private p05 = 1;
  private p06 = 1;
  private p07 = 1;
  private p08 = 1;
  private p09 = 1;
  private p10 = 1;
  private readonly defaultsB2 = -1.7;
  private readonly defaultsB3 = -1;
  private readonly WEIGHT_LIMIT = 6000;

  // Differential working ranges (set per-step).
  private fAccelLower = 10;
  private fAccelDefault = 20;
  private fAccelUpper = 30;
  private fDecelLower = 0;
  private fDecelDefault = 3;
  private fDecelUpper = 5;
  private rAccelLower = 25;
  private rAccelDefault = 30;
  private rAccelUpper = 45;
  private rDecelLower = 20;
  private rDecelDefault = 30;
  private rDecelUpper = 40;
  private centerLower = 60;
  private centerDefault = 65;
  private centerUpper = 70;
  private adjustmentScale = 1.33;
  /** Rally spring/damper natural-frequency margin (Se.W_MARGIN). */
  private readonly W_MARGIN = 0.01;

  // Derived weight quantities.
  private E5 = 0; // total mass, kg
  private E6 = 0; // weight force, N
  private B11 = 0; // total mass, lbs
  private B12 = 0; // percent front
  private E14 = 0; // front mass, kg
  private E15 = 0; // rear mass, kg
  private E16 = 0; // front spring energy term
  private E17 = 0; // rear spring energy term

  private result: Partial<TuneResult> = {};

  constructor(private req: TuneRequest) {}

  calculate(): TuneResult {
    this.initialize();
    // Rally is a distinct calculator path in ForzaTune (the `Se` subclass): a
    // pre-filter seeds rally-specific offsets, several steps use a different
    // (softer, natural-frequency-limited) model, and a post-filter trims tyres,
    // caster and brake bias.
    const rally = this.req.tuneType === TuneType.Rally;
    if (rally) this.rallyPreFilter();
    this.stepTires();
    this.stepAlignment();
    this.stepSprings();
    this.stepDamping();
    this.stepSwayBars();
    this.stepBrakes();
    this.stepDifferentials();
    this.stepGearing();
    this.stepAero();
    if (rally) this.rallyPostFilter();
    return this.result as TuneResult;
  }

  private get isRally(): boolean {
    return this.req.tuneType === TuneType.Rally;
  }

  /** Rally treats the Cross-Country / off-road surface specially. */
  private get isRallyOffRoad(): boolean {
    return this.req.surface.id.includes('off-road');
  }

  // ---- helpers --------------------------------------------------------------

  private mapF(n: number, lo: number, hi: number, outLo: number, outHi: number): number {
    return outLo + ((outHi - outLo) / (hi - lo)) * (n - lo);
  }
  private sigmoid(n: number, lo: number, hi: number, mid: number, k: number): number {
    return lo + (hi - lo) / (1 + Math.exp(-k * (n - mid)));
  }
  private boundary(n: number, lo: number, hi: number): number {
    return n < lo ? lo : n > hi ? hi : n;
  }
  private get widthToHeight(): number {
    return this.req.geometry.width / this.req.geometry.height;
  }
  private get averageTrack(): number {
    return (this.req.geometry.frontTrack + this.req.geometry.rearTrack) / 2;
  }

  private initialize(): void {
    this.B12 = this.req.percentFront;
    // Engine runs metric: input weight is kg.
    this.E5 = this.req.weightKg;
    this.B11 = this.req.weightKg / 0.453592;
    this.E6 = 9.807 * this.E5;
    this.E14 = (this.E5 * this.req.percentFront) / 100;
    this.E15 = this.E5 - this.E14;
    this.o1 = 1.06;
  }

  // ---- step 1: tyre pressures ----------------------------------------------

  private stepTires(): void {
    // FH5 uses the step01c path for both axles.
    let front = this.pressureForFraction(this.B12 / 100);
    let rear = this.pressureForFraction((100 - this.B12) / 100);
    if (this.req.tuneType === TuneType.Dry) {
      front *= 0.95;
      rear *= 0.95;
    }
    this.result.tires = {
      front: new PressureValue(front, false),
      rear: new PressureValue(rear, false),
    };
  }

  private pressureForFraction(frac: number): number {
    let w = this.B11;
    if (w > 4000) w = 4000;
    else if (w < 1600) w = 1600;
    const a = 0.0026 * frac * w + 25.2;
    return Math.max(20, Math.min(45, a));
  }

  // ---- step 2: alignment ----------------------------------------------------

  private stepAlignment(): void {
    const drivetrain = this.req.drivetrain;
    const wth = this.boundary(this.widthToHeight, 0.75, 2);
    const minH = 0.762 * 1.31;
    const maxH = 2.8 / 2.15;
    const d = this.boundary(this.req.geometry.height, minH, maxH);
    const heightFactor = this.mapF(d, minH, maxH, 1.5, 1);
    const piFactor = this.mapF(this.req.performanceIndex, 300, 1000, 1, 1.2);
    const widthFactor = this.mapF(wth, 0.75, 2, 25, -40);

    let front = (this.defaultsB2 * (100 + widthFactor)) / 100;
    let rear = ((this.defaultsB3 * (100 + widthFactor)) / 100) * heightFactor * piFactor;

    if (drivetrain === Drivetrain.AWD) rear -= 0.1;
    if (drivetrain === Drivetrain.FWD) front *= 0.85;
    if (this.req.tuneType === TuneType.Dry) front *= 0.75;

    front = this.boundary(front, -2.2, -0.3);
    rear = this.boundary(rear, -2.2, -0.3);

    // FH5: toe is always zero.
    const frontToe = 0;
    const rearToe = 0;

    let caster = 5.7 + (this.req.performanceIndex - 100) / 900;
    if (drivetrain === Drivetrain.FWD) caster *= 1.05;
    if (drivetrain === Drivetrain.AWD) caster *= 1.03;

    this.result.alignment = {
      frontCamber: new CamberValue(front, false),
      rearCamber: new CamberValue(rear, false),
      frontToe: new ToeValue(frontToe, false),
      rearToe: new ToeValue(rearToe, false),
      caster: new CasterValue(caster, false),
    };
  }

  // ---- step 3: springs + ride height ---------------------------------------

  private getWeightAdjust(): number {
    if (this.B11 > 3000 && this.B11 <= this.WEIGHT_LIMIT) {
      return (100 - 0.01 * (this.B11 - 3000)) / 100;
    }
    return 1;
  }

  private getBaseF(): number {
    const e = 6.790123457e-7 * Math.pow(this.req.performanceIndex - 100, 2) + 2.45;
    return e * this.getWeightAdjust();
  }

  private mapSpringRate(n: number): number {
    const i = 0.1785796726;
    const e = this.B11; // weight in lbs
    return this.mapF(n / i, 0.05175 * e, 0.41425 * e, 0.1036 * e, 0.518 * e) * i;
  }

  private stepSprings(): void {
    if (this.isRally) {
      this.stepSpringsRally();
      return;
    }
    const baseF = this.getBaseF();
    const stiffness = this.req.surface.stiffness;
    const rideStiffness = TUNE_MODIFIER_DEFAULT;

    if (this.req.drivetrain === Drivetrain.RWD) this.o3 -= 0.618;
    if (this.req.drivetrain === Drivetrain.AWD) this.o3 -= 0.618;

    const s = 100 + 0.1 * (100 - TUNE_MODIFIER_DEFAULT) - this.o3;
    if (this.req.tuneType === TuneType.Dry) this.o1 *= 0.905;
    if (this.req.performanceIndex > 900 && this.req.geometry.height < 41 * 0.025) this.o1 *= 1.2;

    const l = (baseF * rideStiffness) / 100 * (stiffness / 100) * this.o1 * 2 * Math.PI;
    const f = (l * (100 - (s - 100))) / 100 * this.p07;
    this.E16 = 0.5 * this.E14 * Math.pow((l * s) / 100 * this.p06, 2);
    this.E17 = 0.5 * this.E15 * Math.pow(f, 2);

    const h = 0.00101972;
    const front = new SpringValue(this.E5, this.mapSpringRate(this.E16 * h), true, this.req.tuneType);
    const rear = new SpringValue(this.E5, this.mapSpringRate(this.E17 * h), true, this.req.tuneType);
    const rhAdjust = Math.round((100 - rideStiffness) / 10);
    const rideHeight = new RideHeightValue(this.req.surface.rideHeight + rhAdjust + this.o4, false);
    this.result.springs = { front, rear, rideHeight };
  }

  // ---- rally tune path (ForzaTune `Se` subclass) ---------------------------

  /**
   * Rally pre-filter (Se.preFilter + Se.step07Setup, FH5 branch).
   * Seeds the ride-height bump (`o4`), the ARB multiplier (`o2`), and the
   * rally-specific differential ranges before the steps run.
   */
  private rallyPreFilter(): void {
    this.o4 = 3;
    this.o2 = 0.25;
    if (this.isRallyOffRoad) {
      this.o4 = 6;
      this.o2 = 0.2;
    }
    // Differential working ranges (Se.step07Setup).
    this.fAccelLower = 10;
    this.fAccelDefault = 25;
    this.fAccelUpper = 40;
    this.fDecelLower = 0;
    this.fDecelDefault = 5;
    this.fDecelUpper = 10;
    this.rAccelLower = 40;
    this.rAccelDefault = 60;
    this.rAccelUpper = 80;
    this.rDecelLower = 20;
    this.rDecelDefault = 30;
    this.rDecelUpper = 40;
    if (this.req.drivetrain === Drivetrain.RWD) {
      this.rDecelLower = 5;
      this.rDecelDefault = 10;
      this.rDecelUpper = 15;
    }
    this.centerLower = 50;
    this.centerDefault = 62;
    this.centerUpper = 75;
  }

  /**
   * Rally post-filter (Se.postFilter, FH5 branch).
   * Trims tyre pressures, overrides caster and brake bias, and (off-road only)
   * softens camber.
   */
  private rallyPostFilter(): void {
    const r = this.result;
    let tf = r.tires!.front.englishValueAsNumber * 0.93;
    let tr = r.tires!.rear.englishValueAsNumber * 0.93;
    let caster = this.req.drivetrain === Drivetrain.RWD ? 6.3 : 5.7;
    let bias = 52;

    if (this.isRallyOffRoad) {
      tf *= 0.94;
      tr *= 0.94;
      caster = 5.5;
      bias = 50;
      let fc = r.alignment!.frontCamber.englishValueAsNumber * 0.95;
      let rc = r.alignment!.rearCamber.englishValueAsNumber * 0.95;
      if (fc > -0.5) fc = -0.5;
      if (rc > -0.5) rc = -0.5;
      r.alignment!.frontCamber = new CamberValue(fc, false);
      r.alignment!.rearCamber = new CamberValue(rc, false);
    }

    r.tires = { front: new PressureValue(tf, false), rear: new PressureValue(tr, false) };
    r.alignment!.caster = new CasterValue(caster, false);
    r.brakes = new BrakeValue(bias); // force stays 100 (BrakeValue default)
  }

  /** Rally spring/damper natural-frequency limit (Se.getSpringDamperLimit, FH5). */
  private rallySpringLimit(): { minW: number; maxW: number } {
    // FH5 generic limit. (ForzaTune additionally has a per-car override table
    // keyed by its internal car id; the generic limit covers the vast majority
    // of cars including this one.)
    return { minW: 1.802, maxW: 3.18 };
  }

  /** Rally natural-frequency target (Se.getBaseF). */
  private rallyBaseF(): number {
    const { minW } = this.rallySpringLimit();
    let e = 1.05 + 2 * this.W_MARGIN;
    if (this.isRallyOffRoad) e = 1 + this.W_MARGIN / 2;
    const hi = 1.125;
    const lo = 0.95;
    let a = this.mapF(this.req.geometry.height, 0.76, 2.3, hi, lo);
    if (a < lo) a = lo;
    else if (a > hi) a = hi;
    return minW * e * a;
  }

  /** Rally springs + ride height (Se.step03). `mapRates` is identity here. */
  private stepSpringsRally(): void {
    const n = this.req.percentFront / 100;
    const rideStiffness = TUNE_MODIFIER_DEFAULT;
    let s = (this.rallyBaseF() * rideStiffness) / 100 * this.o1;

    const { minW: l, maxW: u } = this.rallySpringLimit();
    const f = Math.abs(0.5 - n);
    const h = u * (1 - f);
    const c = l * (1 + f);
    if (s > h) s = h;
    else if (s < c) s = c;

    const d = 100 + 0.1 * (100 - TUNE_MODIFIER_DEFAULT) - this.o3;
    let g = (s * d) / 100 * this.p06;
    let m = (s * (100 - (d - 100))) / 100 * this.p07;
    if (g > u || m > u) {
      const V = g - u;
      const U = m - u;
      const k = V > U ? 1 - V / g : 1 - U / m;
      g *= k;
      m *= k;
    } else if (g < l || m < l) {
      const V = l - g;
      const U = l - m;
      const k = V > U ? 1 + V / g : 1 + U / m;
      g *= k;
      m *= k;
    }

    const R = 2 * g * Math.PI;
    const F = 2 * m * Math.PI;
    this.E16 = 0.5 * this.E14 * Math.pow(R, 2);
    this.E17 = 0.5 * this.E15 * Math.pow(F, 2);

    const hConv = 0.00101972;
    const frontRate = this.E16 * hConv;
    const rearRate = this.E17 * hConv;
    const frontMin = 0.05116 * n * Math.pow(l, 2);
    const rearMin = 0.05116 * (1 - n) * Math.pow(l, 2);
    const sharedMax = 0.02558 * Math.pow(u, 2);

    const front = new SpringValue(this.E5, frontRate, true, this.req.tuneType, frontMin, sharedMax);
    const rear = new SpringValue(this.E5, rearRate, true, this.req.tuneType, rearMin, sharedMax);
    const rhAdjust = Math.round((100 - rideStiffness) / 10);
    const rideHeight = new RideHeightValue(this.req.surface.rideHeight + rhAdjust + this.o4, false);
    this.result.springs = { front, rear, rideHeight };
  }

  /** Rally damping coefficient (Se.stepd). */
  private rallyStepd(): number {
    let n = 1;
    if (!this.isRallyOffRoad) n *= 1.025;
    n *= 1.12; // FH5
    const lo = 0.38;
    let s = this.mapF(this.req.weightKg, 3000, 6000, 1, lo);
    if (s < lo) s = lo;
    else if (s > 1) s = 1;
    return n * s;
  }

  /** Rally damping (Se.step04). `mapRates04` is identity; bounds come from the limit. */
  private stepDampingRally(): void {
    const nFront = 2 * Math.sqrt(0.5 * this.E14 * this.E16);
    const nRear = 2 * Math.sqrt(0.5 * this.E15 * this.E17);
    const a = this.rallyStepd() * (1 + ((TUNE_MODIFIER_DEFAULT - 100) / 100) * 0.5);
    const u = nFront * a * 0.00101972;
    const fv = nRear * a * 0.00101972;

    const rwd = this.req.drivetrain === Drivetrain.RWD;
    let h = rwd ? 1.5 : 1.333;
    let c = rwd ? 1.38 : 1.55;
    let dd = this.isRallyOffRoad ? 2.75 : 2;
    dd *= 1.62; // FH5
    h *= dd;
    c *= dd;

    const g = h + 0.01425 * (100 - TUNE_MODIFIER_DEFAULT * this.p05);
    const m = c - 0.01425 * (100 - TUNE_MODIFIER_DEFAULT * this.p08);
    let bumpFront = u / (1 + g);
    let bumpRear = fv / (1 + m);

    // Bump floor (generic rally min = 1): scale both axles up by the larger need.
    let scale = 0;
    if (bumpFront < 1) scale = Math.max(scale, 1 / bumpFront);
    if (bumpRear < 1) scale = Math.max(scale, 1 / bumpRear);
    if (scale > 0) {
      bumpFront *= scale;
      bumpRear *= scale;
    }

    let reboundFront = u - bumpFront;
    let reboundRear = fv - bumpRear;
    const v = 0.618;
    if (reboundFront / bumpFront < g * v || reboundRear / bumpRear < m * v) {
      reboundFront = g * v * bumpFront;
      reboundRear = m * v * bumpRear;
    }

    // Rebound ceiling (generic rally max = 20).
    scale = 0;
    if (reboundFront > 20) scale = Math.max(scale, 20 / reboundFront);
    if (reboundRear > 20) scale = Math.max(scale, 20 / reboundRear);
    if (scale > 0) {
      reboundFront *= scale;
      reboundRear *= scale;
    }

    this.result.damping = {
      frontBump: new DampingValue(bumpFront, false, this.req.tuneType, DamperType.Bump),
      rearBump: new DampingValue(bumpRear, false, this.req.tuneType, DamperType.Bump),
      frontRebound: new DampingValue(reboundFront, false, this.req.tuneType, DamperType.Rebound),
      rearRebound: new DampingValue(reboundRear, false, this.req.tuneType, DamperType.Rebound),
    };
  }

  // ---- step 4: damping ------------------------------------------------------

  private dampingRatio(): number {
    let n = 0.77;
    if (
      (this.req.tuneType === TuneType.Dry || this.req.tuneType === TuneType.Drift)
    ) {
      n *= 1.25; // FH5 Dry/Drift
    }
    return n;
  }

  private mapDamping(n: number): number {
    // FH5: ignore the passed scaling, use 1.02 over the [1,13]→[1,20] map.
    return this.mapF(n, 1, 13, 1, 20) * 1.02;
  }

  private stepDamping(): void {
    if (this.isRally) {
      this.stepDampingRally();
      return;
    }
    const dry = this.req.tuneType === TuneType.Dry;
    const drift = this.req.tuneType === TuneType.Drift;
    if (dry || drift) {
      this.dampingDryDrift();
      return;
    }

    const nFront = 2 * Math.sqrt((this.E14 / 2) * this.E16);
    const nRear = 2 * Math.sqrt((this.E15 / 2) * this.E17);
    const ratio = this.dampingRatio();
    let l = nFront * (ratio * this.p09) * 0.00101972;
    let u = nRear * (ratio * this.p10) * 0.00101972;
    l *= 1.1;
    u *= 1.1;

    let f = 1.38;
    let h = 1.318; // FH5 base
    f *= 1.15;
    h *= 1.15;
    l *= 0.9;
    u *= 0.9;

    const g = l / (1 + (f + 0.01425 * (100 - TUNE_MODIFIER_DEFAULT * this.p05)));
    const m = u / (h - 0.01425 * (100 - TUNE_MODIFIER_DEFAULT * this.p08) + 1);
    const reboundFront = l - g;
    const reboundRear = u - m;

    this.result.damping = {
      frontBump: new DampingValue(this.mapDamping(g), false, this.req.tuneType, DamperType.Bump),
      rearBump: new DampingValue(this.mapDamping(m), false, this.req.tuneType, DamperType.Bump),
      frontRebound: new DampingValue(this.mapDamping(reboundFront), false, this.req.tuneType, DamperType.Rebound),
      rearRebound: new DampingValue(this.mapDamping(reboundRear), false, this.req.tuneType, DamperType.Rebound),
    };
  }

  private dampingDryDrift(): void {
    const norm = (this.E5 / 1315.5) * this.getWeightAdjust();
    const iFront = (2 * Math.sqrt((this.E14 / 2) * this.E16)) / norm;
    const sRear = (2 * Math.sqrt((this.E15 / 2) * this.E17)) / norm;
    const ratio = this.dampingRatio();
    if (this.req.tuneType === TuneType.Dry) {
      this.p09 *= 1 / 0.905;
      this.p10 *= 1 / 0.905;
    }
    let f = iFront * (ratio * this.p09) * 0.00101972;
    let h = sRear * (ratio * this.p10) * 0.00101972;
    f *= 1.1;
    h *= 1.1;

    let c = 1.38;
    let d = 1.318; // FH5 base
    if (this.req.drivetrain === Drivetrain.AWD && this.req.tuneType === TuneType.Dry) c = 1.33;
    if (this.req.drivetrain === Drivetrain.FWD && this.req.tuneType === TuneType.Dry) d = 1.33;
    c *= 1.15;
    d *= 1.15;
    f *= 0.9;
    h *= 0.9;

    const bumpFront = f / (1 + (c + 0.01425 * (100 - TUNE_MODIFIER_DEFAULT * this.p05)));
    const bumpRear = h / (d - 0.01425 * (100 - TUNE_MODIFIER_DEFAULT * this.p08) + 1);
    const reboundFront = f - bumpFront;
    const reboundRear = h - bumpRear;

    this.result.damping = {
      frontBump: new DampingValue(this.mapDamping(bumpFront), false, this.req.tuneType, DamperType.Bump),
      rearBump: new DampingValue(this.mapDamping(bumpRear), false, this.req.tuneType, DamperType.Bump),
      frontRebound: new DampingValue(this.mapDamping(reboundFront), false, this.req.tuneType, DamperType.Rebound),
      rearRebound: new DampingValue(this.mapDamping(reboundRear), false, this.req.tuneType, DamperType.Rebound),
    };
  }

  // ---- step 5: anti-roll bars ----------------------------------------------

  private get05Bias(): number {
    if (this.req.drivetrain === Drivetrain.RWD && this.B12 < 50) return this.B12 / 10 + 45;
    if (this.req.drivetrain === Drivetrain.FWD) return this.B12 - 5;
    return this.B12;
  }

  private mapSway(n: number): number {
    return this.mapF(n, 1, 40, 1, 65);
  }

  private stepSwayBars(): void {
    let n = 0.381 * this.req.geometry.height;
    n *= 1.07; // FH5
    const e = n * this.E6;
    let i = (-0.38 / 900) * this.req.performanceIndex + 469 / 450 - 0.15;
    if (this.req.performanceIndex > 900 && this.req.geometry.height < 1.125) {
      let factor = 0.5;
      if (this.req.geometry.height > 1) {
        factor = Math.min(0.5 + 0.5 * Math.pow((this.req.geometry.height / 0.025 - 40) / 10, 2), 1);
      }
      i *= factor;
    }
    const s = e / i;
    const a = (Math.PI * this.E16 * Math.pow(this.averageTrack, 2)) / 360;
    const l = (Math.PI * this.E17 * Math.pow(this.averageTrack, 2)) / 360;
    const f = (s * (this.get05Bias() + 0.25 * (100 - TUNE_MODIFIER_DEFAULT) - this.o3)) / 100;
    const d = s - f - l;
    const g = (360 * (f - a)) / (Math.PI * Math.pow(this.req.geometry.frontTrack, 2));
    const m = (360 * d) / (Math.PI * Math.pow(this.req.geometry.rearTrack, 2));

    const rollStiffness = TUNE_MODIFIER_DEFAULT;
    const R = ((0.00101972 * g) / 10) * (rollStiffness / 100) * this.o2;
    const F = ((0.00101972 * m) / 10) * (rollStiffness / 100) * this.o2;

    this.result.swayBars = {
      front: new SwayBarValue(this.mapSway(R)),
      rear: new SwayBarValue(this.mapSway(F)),
    };
  }

  // ---- step 6: brakes -------------------------------------------------------

  private stepBrakes(): void {
    let l = this.sigmoid(TUNE_MODIFIER_DEFAULT, 48, 52, 100, -0.1);
    l = 100 - l; // Horizon
    this.result.brakes = new BrakeValue(l);
  }

  // ---- step 7: differentials ------------------------------------------------

  private calcL(): number {
    if (this.req.drivetrain === Drivetrain.FWD) return 0.815;
    switch (this.req.geometry.engineLocation) {
      case EngineLocation.Mid:
        return 0.84;
      case EngineLocation.Rear:
        return 0.9;
      default:
        return 0.817;
    }
  }

  private dCalc06(): number {
    const e = this.req.geometry.wheelbase;
    const i = this.req.geometry.frontTrack;
    const s = this.req.geometry.rearTrack;
    const a = this.req.percentFront;
    const u = (e * (100 - a)) / 100;
    const f = Math.sqrt(Math.pow((e * a) / 100, 2) + Math.pow(i / 2, 2));
    const h = Math.sqrt(Math.pow(u, 2) + Math.pow(s / 2, 2));
    const c = this.E14;
    const d = this.E15;
    let q =
      (this.calcL() * (c * Math.pow(f, 2) - d * Math.pow(h, 2))) / this.E5 / (((i + s) / 2) * e);
    if (q < -0.4) q = -0.4;
    else if (q > 0.4) q = 0.4;
    return q;
  }

  private stepDifferentials(): void {
    // FH5 differential ranges already set as field defaults.
    let e = 1;
    let iAdj = 1;
    if (this.req.drivetrain === Drivetrain.AWD) {
      e = 0.9;
      iAdj = 1.1;
    }
    const s = this.mapF(this.req.performanceIndex, 0, 1000, 500, 1000);
    const a = this.mapF(s, 500, 1000, -0.05, -0.15);
    const l = this.dCalc06();

    this.rDecelDefault = this.mapF(l, -0.4, 0.4, this.rDecelUpper, this.rDecelLower) + a * this.rDecelDefault;
    this.rAccelDefault = this.mapF(l, -0.4, 0.4, this.rAccelLower, this.rAccelUpper) + a * this.rAccelDefault;
    this.fAccelDefault = this.mapF(l, -0.4, 0.4, this.fAccelUpper, this.fAccelLower) + a * this.fAccelDefault;
    this.fDecelDefault = this.mapF(l, -0.4, 0.4, this.fDecelUpper, this.fDecelLower) + a * this.fDecelDefault;

    this.fAccelDefault *= e;
    this.fDecelDefault *= e;
    this.rAccelDefault *= iAdj;
    this.rDecelDefault *= e;

    this.fAccelDefault = this.boundary(this.fAccelDefault, this.fAccelLower, this.fAccelUpper);
    this.rAccelDefault = this.boundary(this.rAccelDefault, this.rAccelLower, this.rAccelUpper);
    this.fDecelDefault = this.boundary(this.fDecelDefault, this.fDecelLower, this.fDecelUpper);
    this.rDecelDefault = this.boundary(this.rDecelDefault, this.rDecelLower, this.rDecelUpper);
    this.centerDefault = this.mapF(l, -0.4, 0.4, this.centerLower, this.centerUpper);

    // Balance modifiers neutral (100) ⇒ multipliers collapse to 1.
    const front = new DifferentialValue(this.fAccelDefault, this.fDecelDefault);
    const rear = new DifferentialValue(this.rAccelDefault, this.rDecelDefault);
    this.result.differentials = new Differentials(front, rear, this.centerDefault);
  }

  // ---- step 8: gearing ------------------------------------------------------

  private stepGearing(): void {
    if (!this.req.gearing) return;
    const calc = new GearCalculator(this.req.gearing, true, this.B11);
    this.result.gears = calc.calculate();
  }

  // ---- step 9: aero ---------------------------------------------------------

  private predictAeroRatio(): number {
    const PI = this.req.performanceIndex;
    let l = 0.00096 * PI + 0.00018 * this.B11 - 0.000086 * this.B12 - 0.604; // Horizon
    return Math.min(1.2, Math.max(0.35, l));
  }

  private stepAero(): void {
    const offset = TUNE_MODIFIER_DEFAULT - 100; // 0
    let ratio = 1;
    const t = this.req.tuneType;
    if (t === TuneType.Dry || t === TuneType.Drift || t === TuneType.Rain) {
      ratio = this.predictAeroRatio();
    }
    const aero = new AeroValue(this.req.surface.aeroCode, offset, ratio);
    this.result.aero = {
      message: this.req.surface.aeroMessage,
      frontLabel: aero.frontLabel,
      rearLabel: aero.rearLabel,
      frontValue: aero.frontValue,
      rearValue: aero.rearValue,
    };
  }
}

/** Convenience wrapper. */
export function calculateTune(req: TuneRequest): TuneResult {
  return new TuneCalculator(req).calculate();
}
