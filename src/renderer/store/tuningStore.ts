import { create } from 'zustand';
import type { Car } from '@shared/tuning';
import type { WeightUnit, SpringUnit, PressureUnit, SpeedUnit } from '@shared/tuning';

/**
 * Persistence + preferences for the tuning calculator.
 *
 * Unit choices and user-added cars are kept in localStorage so they survive
 * across sessions without involving the main process. The calculation itself
 * runs in the component from these inputs.
 */

export interface TuningUnits {
  weight: WeightUnit;
  spring: SpringUnit;
  pressure: PressureUnit;
  speed: SpeedUnit;
}

const DEFAULT_UNITS: TuningUnits = {
  weight: 'kg',
  spring: 'kgfmm',
  pressure: 'psi',
  speed: 'kmh',
};

const UNITS_KEY = 'tuning.units';
const CARS_KEY = 'tuning.userCars';

function loadUnits(): TuningUnits {
  try {
    const raw = localStorage.getItem(UNITS_KEY);
    if (raw) return { ...DEFAULT_UNITS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return DEFAULT_UNITS;
}

function loadUserCars(): Car[] {
  try {
    const raw = localStorage.getItem(CARS_KEY);
    if (raw) return JSON.parse(raw) as Car[];
  } catch {
    /* ignore */
  }
  return [];
}

interface TuningStoreState {
  units: TuningUnits;
  userCars: Car[];
  setUnit: <K extends keyof TuningUnits>(key: K, value: TuningUnits[K]) => void;
  addUserCar: (car: Car) => void;
  removeUserCar: (id: number) => void;
}

export const useTuningStore = create<TuningStoreState>((set, get) => ({
  units: loadUnits(),
  userCars: loadUserCars(),

  setUnit: (key, value) => {
    const units = { ...get().units, [key]: value };
    localStorage.setItem(UNITS_KEY, JSON.stringify(units));
    set({ units });
  },

  addUserCar: (car) => {
    // De-dupe by id; user cars win over a stale entry with the same id.
    const userCars = [...get().userCars.filter((c) => c.id !== car.id), { ...car, userAdded: true }];
    localStorage.setItem(CARS_KEY, JSON.stringify(userCars));
    set({ userCars });
  },

  removeUserCar: (id) => {
    const userCars = get().userCars.filter((c) => c.id !== id);
    localStorage.setItem(CARS_KEY, JSON.stringify(userCars));
    set({ userCars });
  },
}));
