/**
 * Enumerations for the tuning calculator.
 *
 * These mirror the numeric enum values used by the original ForzaTune Pro
 * calculation engine so the ported formulas behave identically. The calculator
 * targets the Forza Horizon 5 code path, which is the closest match available
 * for Forza Horizon 6 (the source app predates FH6).
 */

export enum Drivetrain {
  RWD = 1,
  FWD = 2,
  AWD = 3,
}

export enum TuneType {
  /** Standard grip / road race tune. */
  Dry = 1,
  Rain = 2,
  Drift = 3,
  Drag = 4,
  Rally = 5,
  Truck = 6,
  Buggy = 7,
}

export enum EngineLocation {
  Front = 'F',
  Mid = 'M',
  Rear = 'R',
}

export enum DamperType {
  Rebound = 1,
  Bump = 2,
}

/** Human-readable labels for the tune types, in display order. */
export const TUNE_TYPE_LABELS: { value: TuneType; label: string }[] = [
  { value: TuneType.Dry, label: 'Road / Race (Dry)' },
  { value: TuneType.Drift, label: 'Drift' },
  { value: TuneType.Rain, label: 'Rain Race' },
  { value: TuneType.Drag, label: 'Drag Race' },
  { value: TuneType.Rally, label: 'Rally Suspension' },
  { value: TuneType.Truck, label: 'Stock Adjustable Truck' },
  { value: TuneType.Buggy, label: 'Stock Adjustable Buggy' },
];

export const DRIVETRAIN_LABELS: { value: Drivetrain; label: string }[] = [
  { value: Drivetrain.RWD, label: 'RWD' },
  { value: Drivetrain.FWD, label: 'FWD' },
  { value: Drivetrain.AWD, label: 'AWD' },
];

/**
 * Tune types available for each driving surface, mirroring ForzaTune Pro.
 *
 * Street (paved) surfaces offer the road-oriented tunes; the loose surfaces
 * (Dirt or Sand Trails, Cross Country or Off-Road) offer the off-road tunes.
 * Selecting a surface constrains the tune type so the calculator never receives
 * a contradictory pairing (e.g. Rally on Street, or Drag on dirt).
 */
export const SURFACE_TUNE_TYPES: Record<string, TuneType[]> = {
  street: [TuneType.Dry, TuneType.Drift, TuneType.Rain, TuneType.Drag],
  'dirt-sand': [TuneType.Rally, TuneType.Truck, TuneType.Buggy],
  'off-road': [TuneType.Rally, TuneType.Truck, TuneType.Buggy],
};

/** Tune types allowed on a given surface id (falls back to road tunes). */
export function tuneTypesForSurface(surfaceId: string): TuneType[] {
  return SURFACE_TUNE_TYPES[surfaceId] ?? SURFACE_TUNE_TYPES.street;
}
