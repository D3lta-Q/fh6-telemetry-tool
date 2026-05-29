/**
 * Normalized tune-parameter model.
 *
 * A calculated `TuneResult` carries typed value objects (PressureValue,
 * SwayBarValue, …). For the Tune Refinement view we need a flat, uniform list
 * of adjustable parameters so we can:
 *   - render every value as a slider row with a consistent dot position, and
 *   - let the analysis engine target individual values by a stable id and
 *     nudge them within their valid range.
 *
 * Values here are kept in the engine's *raw* terms (the English/native figure
 * and its English min/max), exactly as the sliders' percentFill uses them.
 * Unit-dependent display formatting (psi↔bar, lb/in↔kgf/mm) is applied later
 * in the renderer, so this module stays free of user preferences.
 */

import type { TuneResult } from '../tuning';

/** How the renderer should format a parameter's numeric value for display. */
export type ParamFormat =
  | 'pressure' // psi → user pressure unit
  | 'spring' // lb/in → user spring unit
  | 'deg' // degrees
  | 'num' // plain number (clicks)
  | 'pct' // percentage
  | 'rideHeight' // qualitative band label
  | 'aero' // qualitative downforce label
  | 'ratio'; // gear ratio (read-only)

export interface TuneParam {
  id: string;
  section: string;
  subSection?: string;
  label: string;
  /** Raw value in engine terms (English/native). */
  value: number;
  /** Raw range used for the slider dot position. */
  min: number;
  max: number;
  format: ParamFormat;
  decimals: number;
  /** Whether the refinement engine is allowed to move this value. */
  adjustable: boolean;
  /** Read-only text rows (gear ratios) carry a precomputed string instead. */
  text?: string;
}

const RIDE_HEIGHT_MIN = 0;
const RIDE_HEIGHT_MAX = 11;

/** Qualitative ride-height band, mirroring RideHeightValue.label. */
export function rideHeightLabel(v: number): string {
  if (v > 10) return 'MAX';
  if (v > 7) return 'HIGH';
  if (v > 3) return 'MED';
  if (v > 1) return 'LOW';
  return 'MIN';
}

const AERO_BASE = [0, 10, 25, 50, 75, 100];
const AERO_LABELS = ['--', 'Min', 'Low', 'Med', 'High', 'Max'];

/** Nearest qualitative downforce label for a 0..100 aero fill. */
export function aeroLabel(v: number): string {
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < AERO_BASE.length; i++) {
    const d = Math.abs(AERO_BASE[i] - v);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return AERO_LABELS[bestIdx];
}

/**
 * Flatten a calculated tune into the ordered parameter list shown in the
 * refinement panel. The order mirrors the FH6 in-game layout used by
 * ResultsPanel so the two views read identically.
 */
export function flattenTune(result: TuneResult): TuneParam[] {
  const p: TuneParam[] = [];

  const range = (
    id: string,
    section: string,
    subSection: string | undefined,
    label: string,
    rv: { englishValueAsNumber: number; minEnglishValue: number; maxEnglishValue: number },
    format: ParamFormat,
    decimals: number,
    adjustable: boolean
  ) => {
    p.push({
      id,
      section,
      subSection,
      label,
      value: rv.englishValueAsNumber,
      min: rv.minEnglishValue,
      max: rv.maxEnglishValue,
      format,
      decimals,
      adjustable,
    });
  };

  const pct = (
    id: string,
    section: string,
    subSection: string | undefined,
    label: string,
    value: number,
    adjustable: boolean
  ) => {
    p.push({ id, section, subSection, label, value, min: 0, max: 100, format: 'pct', decimals: 0, adjustable });
  };

  // Tires
  range('tirePressureFront', 'Tires', 'Tire Pressure', 'Front', result.tires.front, 'pressure', 1, true);
  range('tirePressureRear', 'Tires', 'Tire Pressure', 'Rear', result.tires.rear, 'pressure', 1, true);

  // Gearing (read-only)
  if (result.gears) {
    p.push({
      id: 'finalDrive', section: 'Gearing', subSection: 'Forward Gears', label: 'Final Drive',
      value: result.gears.final, min: 0, max: 0, format: 'ratio', decimals: 2, adjustable: false,
      text: result.gears.final.toFixed(2),
    });
    result.gears.ratios.forEach((r, i) => {
      p.push({
        id: `gear${i + 1}`, section: 'Gearing', subSection: 'Forward Gears', label: ordinal(i + 1) + ' Gear',
        value: r, min: 0, max: 0, format: 'ratio', decimals: 2, adjustable: false, text: r.toFixed(2),
      });
    });
  }

  // Alignment
  range('camberFront', 'Alignment', 'Camber', 'Front', result.alignment.frontCamber, 'deg', 1, true);
  range('camberRear', 'Alignment', 'Camber', 'Rear', result.alignment.rearCamber, 'deg', 1, true);
  range('toeFront', 'Alignment', 'Toe', 'Front', result.alignment.frontToe, 'deg', 1, true);
  range('toeRear', 'Alignment', 'Toe', 'Rear', result.alignment.rearToe, 'deg', 1, true);
  range('caster', 'Alignment', 'Front Caster', 'Angle', result.alignment.caster, 'deg', 1, true);

  // Antiroll bars
  range('arbFront', 'Antiroll Bars', undefined, 'Front', result.swayBars.front, 'num', 2, true);
  range('arbRear', 'Antiroll Bars', undefined, 'Rear', result.swayBars.rear, 'num', 2, true);

  // Springs
  range('springFront', 'Springs', 'Springs', 'Front', result.springs.front, 'spring', 1, true);
  range('springRear', 'Springs', 'Springs', 'Rear', result.springs.rear, 'spring', 1, true);
  // Ride height: one engine value, shown per-axle and individually adjustable.
  const rh = result.springs.rideHeight;
  p.push({
    id: 'rideHeightFront', section: 'Springs', subSection: 'Ride Height', label: 'Front',
    value: rh.englishValueAsNumber, min: RIDE_HEIGHT_MIN, max: RIDE_HEIGHT_MAX, format: 'rideHeight', decimals: 0, adjustable: true,
  });
  p.push({
    id: 'rideHeightRear', section: 'Springs', subSection: 'Ride Height', label: 'Rear',
    value: rh.englishValueAsNumber, min: RIDE_HEIGHT_MIN, max: RIDE_HEIGHT_MAX, format: 'rideHeight', decimals: 0, adjustable: true,
  });

  // Damping
  range('reboundFront', 'Damping', 'Rebound Stiffness', 'Front', result.damping.frontRebound, 'num', 1, true);
  range('reboundRear', 'Damping', 'Rebound Stiffness', 'Rear', result.damping.rearRebound, 'num', 1, true);
  range('bumpFront', 'Damping', 'Bump Stiffness', 'Front', result.damping.frontBump, 'num', 1, true);
  range('bumpRear', 'Damping', 'Bump Stiffness', 'Rear', result.damping.rearBump, 'num', 1, true);

  // Aero (read-only in v1: not refined from a single test lap)
  p.push({
    id: 'aeroFront', section: 'Aero', subSection: 'Downforce', label: 'Front',
    value: result.aero.frontValue, min: 0, max: 100, format: 'aero', decimals: 0, adjustable: false,
    text: result.aero.frontLabel,
  });
  p.push({
    id: 'aeroRear', section: 'Aero', subSection: 'Downforce', label: 'Rear',
    value: result.aero.rearValue, min: 0, max: 100, format: 'aero', decimals: 0, adjustable: false,
    text: result.aero.rearLabel,
  });

  // Brakes
  pct('brakeBalance', 'Brakes', undefined, 'Braking Balance', result.brakes.balance, true);
  pct('brakePressure', 'Brakes', undefined, 'Braking Pressure', result.brakes.force, false);

  // Differential
  pct('diffFrontAccel', 'Differential', 'Front', 'Acceleration', result.differentials.front.accel, true);
  pct('diffFrontDecel', 'Differential', 'Front', 'Deceleration', result.differentials.front.decel, true);
  pct('diffRearAccel', 'Differential', 'Rear', 'Acceleration', result.differentials.rear.accel, true);
  pct('diffRearDecel', 'Differential', 'Rear', 'Deceleration', result.differentials.rear.decel, true);
  pct('diffCenter', 'Differential', 'Center', 'Balance', result.differentials.centerSplit, true);

  return p;
}

function ordinal(n: number): string {
  const names = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];
  return names[n] ?? `${n}th`;
}
