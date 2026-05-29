/**
 * Car database accessor.
 *
 * The bundled database (cars.json) uses a compact field schema inherited from
 * the source data set. This module maps it to a readable `Car` shape and
 * provides search. User-added cars are merged in from a separate persisted
 * list so the database can grow without editing the bundled asset.
 */

import { EngineLocation } from './enums';
import type { CarGeometry } from './calculator';
import rawCars from './data/cars.json';

/** Compact on-disk schema. */
interface RawCar {
  id: number;
  div: string;
  yr: number;
  mk: string;
  mdl: string;
  cls: string | null;
  p: number; // performance index (stock)
  a: number; // weight, lbs
  b: number; // length, m
  c: number; // width, m
  d: number; // height, m
  e: number; // wheelbase, m
  f: number; // front track, m
  g: number; // rear track, m
  h: string; // engine location F/M/R
}

export interface Car {
  id: number;
  division: string;
  year: number;
  make: string;
  model: string;
  carClass: string | null;
  /** Stock performance index. */
  performanceIndex: number;
  /** Stock weight in kilograms. */
  weightKg: number;
  geometry: CarGeometry;
  /** True if this car came from the user, not the bundled database. */
  userAdded?: boolean;
}

const KG_PER_LB = 0.453592;

function engineLocFromCode(code: string): EngineLocation {
  switch (code) {
    case 'M':
      return EngineLocation.Mid;
    case 'R':
      return EngineLocation.Rear;
    default:
      return EngineLocation.Front;
  }
}

function mapRaw(raw: RawCar): Car {
  return {
    id: raw.id,
    division: raw.div,
    year: raw.yr,
    make: raw.mk,
    model: raw.mdl,
    carClass: raw.cls,
    performanceIndex: raw.p,
    weightKg: raw.a * KG_PER_LB,
    geometry: {
      length: raw.b,
      width: raw.c,
      height: raw.d,
      wheelbase: raw.e,
      frontTrack: raw.f,
      rearTrack: raw.g,
      engineLocation: engineLocFromCode(raw.h),
    },
  };
}

const BUNDLED_CARS: Car[] = (rawCars as RawCar[]).map(mapRaw);

export function bundledCars(): Car[] {
  return BUNDLED_CARS;
}

/** Display name, e.g. "1970 AMC Rebel". */
export function carName(c: Car): string {
  return `${c.year} ${c.make} ${c.model}`;
}

/**
 * Fuzzy-ish search across make/model/year/division. Returns the best matches
 * (cheap substring ranking) capped at `limit`.
 */
export function searchCars(cars: Car[], query: string, limit = 50): Car[] {
  const q = query.trim().toLowerCase();
  if (!q) return cars.slice(0, limit);
  const terms = q.split(/\s+/);
  const scored: { car: Car; score: number }[] = [];
  for (const car of cars) {
    const hay = `${car.year} ${car.make} ${car.model} ${car.division}`.toLowerCase();
    let score = 0;
    let ok = true;
    for (const t of terms) {
      const idx = hay.indexOf(t);
      if (idx === -1) {
        ok = false;
        break;
      }
      // Earlier matches and make/model hits rank higher.
      score += idx === 0 ? 3 : idx < 12 ? 2 : 1;
    }
    if (ok) scored.push({ car, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.car);
}
