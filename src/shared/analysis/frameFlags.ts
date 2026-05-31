/**
 * Per-packet validation classifiers.
 *
 * These are the single source of truth for the three telemetry artefacts the
 * Tune Refinement analysis filters out, and that the Track tab can overlay on
 * the 3D path:
 *   - off-road : any wheel reporting surface rumble (loose surface)
 *   - airborne : all four wheels fully drooped (a jump)
 *   - collision: a hard acceleration impulse with little/no brake input
 *
 * Both the analysis engine and the recorders (live trackStore + main-process
 * Recorder) use these so the path overlay matches what the analyser excludes.
 * Note: the analyser additionally guards a ±1s window around each collision;
 * the overlay marks the impulse frame itself.
 */

import type { TelemetryData } from '../telemetry';

export const G = 9.807; // m/s² per g
export const COLLISION_G = 4.5;
export const OFFROAD_RUMBLE = 0.10;
export const AIRBORNE_TRAVEL = 0.05;
export const BRAKE_NOT_APPLIED = 0.3; // fraction (0..1)

export function maxSurfaceRumble(d: TelemetryData): number {
  return Math.max(
    d.surfaceRumbleFrontLeft,
    d.surfaceRumbleFrontRight,
    d.surfaceRumbleRearLeft,
    d.surfaceRumbleRearRight
  );
}

/** Any wheel on a loose / rumbling surface. */
export function isOffRoad(d: TelemetryData): boolean {
  return maxSurfaceRumble(d) > OFFROAD_RUMBLE;
}

/** All four wheels fully drooped — the car is in the air. */
export function isAirborne(d: TelemetryData): boolean {
  return (
    d.normalizedSuspensionTravelFrontLeft < AIRBORNE_TRAVEL &&
    d.normalizedSuspensionTravelFrontRight < AIRBORNE_TRAVEL &&
    d.normalizedSuspensionTravelRearLeft < AIRBORNE_TRAVEL &&
    d.normalizedSuspensionTravelRearRight < AIRBORNE_TRAVEL
  );
}

/** Handbrake lever engaged above 10% travel. */
export function isHandbrake(d: TelemetryData): boolean {
  return d.handBrake / 255 > 0.1;
}

/** A near-instant deceleration/impact impulse without a matching brake input. */
export function isCollisionImpulse(d: TelemetryData): boolean {
  const latG = d.accelerationX / G;
  const longG = d.accelerationZ / G;
  const impulse = Math.max(Math.abs(latG), Math.abs(longG));
  return impulse > COLLISION_G && d.brake / 255 < BRAKE_NOT_APPLIED;
}
