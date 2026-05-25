import type { AppSettings } from '@shared/telemetry';

/** Convert speed (m/s) into the user's chosen unit. */
export function convertSpeed(metersPerSecond: number, unit: AppSettings['speedUnit']): number {
  switch (unit) {
    case 'ms':
      return metersPerSecond;
    case 'kmh':
      return metersPerSecond * 3.6;
    case 'mph':
      return metersPerSecond * 2.2369362921;
  }
}

export function speedUnitLabel(unit: AppSettings['speedUnit']): string {
  switch (unit) {
    case 'ms':
      return 'm/s';
    case 'kmh':
      return 'km/h';
    case 'mph':
      return 'mph';
  }
}

/** Power in watts to mechanical horsepower. */
export function wattsToHp(watts: number): number {
  return watts / 745.69987158227022;
}

/** Forza Horizon 6 gear field: 0 = neutral, 1..N = forward gears. */
export function formatGear(gear: number): string {
  if (gear === 0) return 'N';
  return String(gear);
}

/**
 * Map a tire temperature (degrees F, the unit Forza emits) to an RGB color
 * on the standard tire-temp gradient: cool blue -> green optimal -> hot red.
 *
 * The temperature ranges are roughly what FH5 sim racers consider optimal.
 * Treat them as visual cues, not racing telemetry truth.
 */
export function tireTempColor(tempF: number): string {
  // Below 130F: cold (blue). 180-220F: optimal (green/yellow). Above 270F: hot (red).
  const t = Math.max(0, Math.min(1, (tempF - 130) / (270 - 130)));
  // 3-stop gradient: blue (#00d4ff) -> lime (#a3ff12) -> red (#ff3c1c)
  if (t < 0.5) {
    const k = t / 0.5;
    return lerpHex('#00d4ff', '#a3ff12', k);
  }
  const k = (t - 0.5) / 0.5;
  return lerpHex('#a3ff12', '#ff3c1c', k);
}

function lerpHex(a: string, b: string, t: number): string {
  const ah = parseInt(a.slice(1), 16);
  const bh = parseInt(b.slice(1), 16);
  const ar = (ah >> 16) & 0xff;
  const ag = (ah >> 8) & 0xff;
  const ab = ah & 0xff;
  const br = (bh >> 16) & 0xff;
  const bg = (bh >> 8) & 0xff;
  const bb = bh & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0')}`;
}
