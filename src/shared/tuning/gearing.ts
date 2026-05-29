/**
 * Gear-ratio calculator, ported from the engine's "calculate from scratch"
 * path (it derives final drive + every gear from the power band, tyre size and
 * target top speed).
 */

export interface GearingRequest {
  /** Redline in RPM. */
  redline: number;
  /** RPM at peak torque. */
  maxTorqueRevs: number;
  /** Peak torque. Interpreted as N·m when isMetric, else lb-ft. */
  maxTorque: number;
  /** Section width of the rear tyre, mm (e.g. 285). */
  tireWidth: number;
  /** Aspect ratio of the rear tyre, percent (e.g. 35). */
  tireRatio: number;
  /** Wheel diameter, inches (e.g. 19). */
  wheelDiameter: number;
  numberOfGears: number;
  /** Target top speed. Interpreted as km/h when isMetric, else mph. */
  topSpeed: number;
}

export interface GearResult {
  final: number;
  ratios: number[]; // index 0 = 1st gear, etc. (length = numberOfGears)
}

export class GearCalculator {
  private redline: number;
  private topSpeed: number; // mph internally
  private numGears: number;
  private maxTorque: number; // lb-ft internally
  private maxTorqueRevs: number;
  private weightLbs: number;
  private tireCircumference = 0;
  private gearingConstant = 0;
  private finalDrive = 0;
  private firstSpeed = 0;

  constructor(private req: GearingRequest, isMetric: boolean, weightLbs: number) {
    this.redline = req.redline;
    this.topSpeed = req.topSpeed;
    this.numGears = req.numberOfGears;
    this.maxTorque = req.maxTorque;
    this.maxTorqueRevs = req.maxTorqueRevs;
    this.weightLbs = weightLbs;
    if (isMetric) {
      this.topSpeed = 0.621371 * req.topSpeed;
      this.maxTorque = 0.737562 * req.maxTorque;
    }
  }

  calculate(): GearResult {
    this.calculateTireCircumference();
    this.calculateGearingConstant();
    this.calculateFinalDrive();
    this.calculateFirstGear();
    const ratios = this.calculateRemainingGears();
    const round2 = (n: number) => Math.round(100 * n) / 100;
    return {
      final: round2(this.finalDrive),
      ratios: ratios.slice(1, this.numGears + 1).map(round2),
    };
  }

  private calculateTireCircumference(): void {
    this.tireCircumference =
      ((2 * this.req.tireRatio) / 100) * this.req.tireWidth * 0.0393701 + this.req.wheelDiameter;
    this.tireCircumference *= Math.PI;
  }

  private calculateGearingConstant(): void {
    this.gearingConstant = (60 * this.tireCircumference) / 63360;
  }

  private calculateFinalDrive(): void {
    this.finalDrive = this.checkGearRatio(
      this.mapWithLimits(this.redline, 4000, 10000, 2.84, 4.725),
      true
    );
  }

  private firstSpeedRecommendation(topSpeed: number, numGears: number): number {
    return ((2 * topSpeed) / (1 + numGears)) * this.firstSpeedAdjustment();
  }

  private firstSpeedAdjustment(): number {
    return this.mapWithLimits(this.maxTorque / this.weightLbs, 0.1, 0.375, 1, 2);
  }

  private firstSpeedLimiter(n: number): number {
    const e = Math.exp(-0.5 * (this.numGears - 2)) + 0.9;
    return (32 * e) / (1 + Math.exp((-0.8 * (n - 45)) / (8 * e))) + 30;
  }

  private calculateFirstGear(): void {
    const n = this.firstSpeedRecommendation(this.topSpeed, this.numGears);
    this.firstSpeed = this.firstSpeedLimiter(n);
    const first = this.checkGearRatio(
      (this.redline * this.gearingConstant) / (this.firstSpeed * this.finalDrive)
    );
    if (first === 6.1) {
      this.firstSpeed = this.calculateSpeedInMphForGear(6.1, this.redline);
    }
  }

  private determineSpeedDifference(): number {
    const min = (this.topSpeed / this.numGears) * 0.85;
    let e = (this.topSpeed / 0.975 - this.firstSpeed) / (this.numGears - 1);
    if (e < min) e = min;
    return e * this.speedDifferenceAdjustment();
  }

  private speedDifferenceAdjustment(): number {
    return this.mapWithLimits(this.maxTorqueRevs / this.redline, 0.3, 0.8, 1.2, 1);
  }

  private calculateRemainingGears(): number[] {
    const diff = this.determineSpeedDifference();
    const speeds: number[] = [];
    const ratios: number[] = [];
    ratios[1] = this.checkGearRatio(
      (this.redline * this.gearingConstant) / (this.firstSpeed * this.finalDrive)
    );
    for (let s = 2; s <= this.numGears; s++) {
      speeds[s] = this.firstSpeed + (s - 1) * diff;
      ratios[s] = this.checkGearRatio(
        (this.redline * this.gearingConstant) / (speeds[s] * this.finalDrive)
      );
    }
    return ratios;
  }

  private checkGearRatio(n: number, isFinal = false): number {
    let min = 0.48;
    let max = 6.1;
    if (isFinal) {
      min = 2.2;
      max = 6;
    }
    if (n < min) return min;
    if (n > max) return max;
    return n;
  }

  private calculateSpeedInMphForGear(ratio: number, rpm: number): number {
    if (this.tireCircumference === 0) this.calculateTireCircumference();
    return (rpm * this.tireCircumference * (5 / 5280)) / (ratio * this.finalDrive);
  }

  private mapWithLimits(n: number, lo: number, hi: number, outLo: number, outHi: number): number {
    if (n > hi) n = hi;
    if (n < lo) n = lo;
    let u = outLo + ((outHi - outLo) / (hi - lo)) * (n - lo);
    if (outHi < outLo) {
      if (u < outHi) u = outHi;
      else if (u > outLo) u = outLo;
    } else {
      if (u < outLo) u = outLo;
      else if (u > outHi) u = outHi;
    }
    return u;
  }
}
