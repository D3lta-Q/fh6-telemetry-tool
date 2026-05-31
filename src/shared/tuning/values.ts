/**
 * Tune value classes, ported from the original engine.
 *
 * Each value stores both an English and a metric figure and clamps to the
 * slider range Forza exposes for that parameter. Construction mirrors the
 * source so numeric results match the reference app on the FH5 code path.
 */

import { DamperType, TuneType } from './enums';

/** Base class holding paired English/metric values with min/max clamping. */
export class TuneValue {
  protected _value: number; // English (imperial) figure
  protected _metricValue: number;
  protected _maxValue: number;
  protected _minValue: number;
  protected _maxMetricValue: number;
  protected _minMetricValue: number;

  constructor(
    maxValue: number,
    minValue: number,
    value: number,
    metric: boolean,
    toEnglishConversion = 1,
    public precision = 1
  ) {
    if (metric) {
      this._metricValue = value;
      this._value = value * toEnglishConversion;
      this._maxMetricValue = maxValue;
      this._minMetricValue = minValue;
      this._maxValue = maxValue * toEnglishConversion;
      this._minValue = minValue * toEnglishConversion;
    } else {
      this._value = value;
      this._metricValue = value / toEnglishConversion;
      this._maxMetricValue = maxValue / toEnglishConversion;
      this._minMetricValue = minValue / toEnglishConversion;
      this._maxValue = maxValue;
      this._minValue = minValue;
    }
    this._value = this.clampValue(this._value, false);
    this._metricValue = this.clampValue(this._metricValue, true);
  }

  get englishValueAsNumber(): number {
    return this._value;
  }
  get metricValueAsNumber(): number {
    return this._metricValue;
  }
  get maxEnglishValue(): number {
    return this._maxValue;
  }
  get minEnglishValue(): number {
    return this._minValue;
  }

  /** 0..100 fill for a slider track, matching the source's percentFill. */
  get percentFill(): number {
    let lo = this._minValue;
    let hi = this._maxValue;
    const v = this._value;
    let n: number;
    if (lo <= 0) {
      n = v < 0 ? -v / lo : v / hi;
    } else {
      n = (v - lo) / (hi - lo);
    }
    return 100 * n;
  }

  protected clampValue(n: number, metric: boolean): number {
    const lo = metric ? this._minMetricValue : this._minValue;
    const hi = metric ? this._maxMetricValue : this._maxValue;
    if (n < lo) return lo;
    if (n > hi) return hi;
    return n;
  }

  protected round(n: number, step = 1): number {
    const i = 1 / step;
    return Math.round(n * i) / i;
  }
}

/** Tyre pressure. English = psi (15..55), metric = bar. Rounds to 0.5 psi. */
export class PressureValue extends TuneValue {
  constructor(value: number, metric: boolean) {
    const a = 0.0689476;
    const max = metric ? 55 * a : 55;
    const min = metric ? 15 * a : 15;
    super(max, min, value, metric, 1 / a, 1);
  }
}

/** Camber, degrees (-5..5). */
export class CamberValue extends TuneValue {
  constructor(value: number, metric: boolean) {
    super(5, -5, value, metric);
  }
}

/** Toe, degrees (-5..5). */
export class ToeValue extends TuneValue {
  constructor(value: number, metric: boolean) {
    super(5, -5, value, metric);
  }
}

/** Caster, degrees (1..7). */
export class CasterValue extends TuneValue {
  constructor(value: number, metric: boolean) {
    super(7, 1, value, metric);
  }
}

/**
 * Spring rate. The slider range scales with car weight and tune type; the
 * 5.5997 conversion maps the engine's metric figure to lb/in (English).
 */
export class SpringValue extends TuneValue {
  constructor(
    weight: number,
    rate: number,
    isMetric: boolean,
    tuneType: TuneType,
    minOverride?: number,
    maxOverride?: number
  ) {
    // FH path: slider range coefficients depend on tune type.
    let h = 0.5180759634;
    let c = 0.1036041031;
    if (minOverride != null && maxOverride != null) {
      c = minOverride;
      h = maxOverride;
    } else {
      switch (tuneType) {
        case TuneType.Rally:
          h = 0.259;
          c = 0.107; // FH5 value
          break;
        case TuneType.Truck:
          h = 0.6;
          c = 0.01;
          break;
        case TuneType.Buggy:
          h = 0.0647;
          c = 0.0518;
          break;
        default:
          h = 0.5180759634;
          c = 0.1036041031;
      }
    }
    if (isMetric) {
      const m = 0.3937236;
      h *= m;
      c *= m;
    }
    super(h * weight, c * weight, rate, isMetric, 5.599741479199016, 1);
  }
}

const RIDE_HEIGHT_LABELS = ['MIN', 'LOW', 'MED', 'HIGH', 'MAX'] as const;

/** Ride height, expressed as a qualitative band (MIN..MAX). */
export class RideHeightValue extends TuneValue {
  constructor(value: number, metric: boolean) {
    super(11, 0, value, metric);
  }
  get label(): string {
    const v = this._value;
    if (v > 10) return 'MAX';
    if (v > 7) return 'HIGH';
    if (v > 3) return 'MED';
    if (v > 1) return 'LOW';
    return 'MIN';
  }
}

/** Damping stiffness (rebound/bump). FH5 slider range 1..20. */
export class DampingValue extends TuneValue {
  constructor(value: number, _metric: boolean, _tuneType: TuneType, _type: DamperType = DamperType.Bump) {
    // FH5: clamp range 1..20, value already in slider units after mapRates04.
    super(20, 1, value, false);
  }
}

/** Anti-roll bar stiffness. FH slider range 1..65. */
export class SwayBarValue extends TuneValue {
  constructor(value: number) {
    super(65, 1, value, false);
  }
}

/** Brake balance + force. */
export class BrakeValue {
  private _force: number;
  constructor(private _balance: number, force = 100) {
    this._force = force;
  }
  /** Front brake bias as a percentage string-free number. */
  get balance(): number {
    return this._balance;
  }
  get balanceDecimal(): number {
    return this._balance / 100;
  }
  get force(): number {
    return this._force;
  }
}

/** A single differential's accel/decel percentages (0..100). */
export class DifferentialValue {
  readonly accel: number;
  readonly decel: number;
  constructor(accel: number, decel: number) {
    this.accel = Math.min(100, Math.max(0, accel));
    this.decel = Math.min(100, Math.max(0, decel));
  }
}

/** Container for front/rear differentials plus the center split. */
export class Differentials {
  constructor(
    public front: DifferentialValue,
    public rear: DifferentialValue,
    public centerSplit: number
  ) {}
}

const AERO_BASE = [0, 10, 25, 50, 75, 100];
const AERO_LABELS = ['--', 'Min', 'Low', 'Med', 'High', 'Max'];

/**
 * Aero downforce recommendation. Produces a front/rear fill (0..100) and a
 * qualitative label, driven by the surface's aero code, a balance offset and a
 * front/rear ratio prediction.
 */
export class AeroValue {
  frontValue = 0;
  rearValue = 0;
  frontLabel = '--';
  rearLabel = '--';

  constructor(
    private code: number,
    private offset: number,
    private ratio = 1
  ) {
    this.calculate();
  }

  private clamp(n: number): number {
    return Math.min(AERO_BASE[5], Math.max(AERO_BASE[0], n));
  }

  private calculate(): void {
    let front: number;
    let rear: number;
    if (this.ratio <= 1) {
      front = 100;
      rear = 100 * this.ratio;
    } else {
      rear = 100;
      front = 100 / this.ratio;
    }
    const a = 100 - AERO_BASE[this.code];
    front -= a;
    rear -= a;
    if (front < 0) {
      rear = this.clamp(rear + Math.abs(front));
      front = 0;
    }
    if (rear < 0) {
      front = this.clamp(front + Math.abs(rear));
      rear = 0;
    }
    front = this.clamp(front);
    rear = this.clamp(rear);

    const l = 50 * (2 / (1 + Math.exp(-0.1618 * this.offset)) - 1);
    if (l !== 0 && this.code !== 0) {
      if (l > 0) {
        rear -= l;
        if (rear < 0) {
          front = this.clamp(front + Math.abs(rear));
          rear = 0;
        }
      } else {
        front += l;
        if (front < 0) {
          rear = this.clamp(rear + Math.abs(front));
          front = 0;
        }
      }
    }
    this.frontValue = Math.round(this.clamp(front));
    this.rearValue = Math.round(this.clamp(rear));
    this.frontLabel = AERO_LABELS[this.labelIndex(this.frontValue)];
    this.rearLabel = AERO_LABELS[this.labelIndex(this.rearValue)];
  }

  private labelIndex(n: number): number {
    const closest = AERO_BASE.reduce((i, s) => (Math.abs(s - n) < Math.abs(i - n) ? s : i));
    const idx = AERO_BASE.findIndex((s) => s === closest);
    return idx === -1 ? this.code : idx;
  }
}
