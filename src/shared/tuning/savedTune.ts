import type { TuneParam } from '@shared/analysis/params';
import type { Car } from './cars';

export interface SavedTuneMeta {
  id: string;
  name: string;
  vehicleName: string;
  savedAt: number;
}

export interface SavedTune extends SavedTuneMeta {
  selectedCar: Car | null;
  manualMode: boolean;
  manual: {
    make: string;
    model: string;
    year: string;
    length: string;
    width: string;
    height: string;
    wheelbase: string;
    frontTrack: string;
    rearTrack: string;
    engineLocation: string;
  };
  weightKg: number;
  percentFront: number;
  performanceIndex: number;
  drivetrain: number;
  surfaceId: string;
  tuneType: number;
  gearingEnabled: boolean;
  gearing: Record<string, string>;
  refinementParams: TuneParam[];
}
