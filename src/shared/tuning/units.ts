/**
 * Unit definitions and conversions for the tuning calculator.
 *
 * The calculation engine runs internally in a fixed unit system; every output
 * value object carries both an English (imperial) and metric figure, and these
 * helpers convert between the unit the user picked for display.
 *
 * Spring rates are produced internally in lb/in (the engine's English value).
 * Forza displays spring rates in kgf/cm but labels them as kgf/mm, so the
 * effective conversion constant is 10× the physical kgf/mm factor:
 *   1 lb/in = 0.17857969 kgf/cm  (displayed by Forza as "kgf/mm")
 *   1 lb/in = 0.17512684 N/mm    (standard physical N/mm conversion)
 */

export type WeightUnit = 'kg' | 'lb';
export type SpringUnit = 'lbin' | 'nmm' | 'kgfmm';
export type PressureUnit = 'psi' | 'bar';
export type SpeedUnit = 'kmh' | 'mph';

export const KG_PER_LB = 0.453592;
export const LB_PER_KG = 1 / KG_PER_LB;
export const PSI_TO_BAR = 0.0689476;
export const KMH_PER_MPH = 1.609344;
export const NMM_PER_LBIN = 0.17512684;
export const KGFMM_PER_LBIN = 0.17857969;
export const NM_PER_LBFT = 1.3558179;

export const WEIGHT_UNIT_LABELS: Record<WeightUnit, string> = { kg: 'kg', lb: 'lbs' };
export const SPRING_UNIT_LABELS: Record<SpringUnit, string> = {
  lbin: 'lb/in',
  nmm: 'N/mm',
  kgfmm: 'kgf/mm',
};
export const PRESSURE_UNIT_LABELS: Record<PressureUnit, string> = { psi: 'psi', bar: 'bar' };
export const SPEED_UNIT_LABELS: Record<SpeedUnit, string> = { kmh: 'km/h', mph: 'mph' };

export function kgToLb(kg: number): number {
  return kg * LB_PER_KG;
}
export function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}

/** Convert an engine spring rate (lb/in) to the chosen display unit. */
export function springFromLbIn(lbin: number, unit: SpringUnit): number {
  switch (unit) {
    case 'nmm':
      return lbin * NMM_PER_LBIN;
    case 'kgfmm':
      return lbin * KGFMM_PER_LBIN;
    default:
      return lbin;
  }
}

/** Convert a tyre pressure (psi) to the chosen display unit. */
export function pressureFromPsi(psi: number, unit: PressureUnit): number {
  return unit === 'bar' ? psi * PSI_TO_BAR : psi;
}
