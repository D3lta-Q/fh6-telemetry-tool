/**
 * Driving surfaces for Forza Horizon.
 *
 * Each surface carries the same parameters the original engine attaches to a
 * "track" object: a base ride-height index, a spring-stiffness percentage, an
 * aero downforce code (index into Min..Max levels) and an explanatory note.
 *
 * Values are taken verbatim from the FH5 surface definitions:
 *   Street            rideHeight 6  stiffness 90  aeroCode 4
 *   Dirt or Sand      rideHeight 8  stiffness 100 aeroCode 0
 *   Cross Country     rideHeight 10 stiffness 95  aeroCode 0
 */

export interface Surface {
  id: string;
  name: string;
  /** Base ride-height slider index (0..11). */
  rideHeight: number;
  /** Spring stiffness percentage applied to the natural-frequency target. */
  stiffness: number;
  /** Index into the [--, Min, Low, Med, High, Max] downforce levels. */
  aeroCode: number;
  aeroMessage: string;
}

export const SURFACES: Surface[] = [
  {
    id: 'street',
    name: 'Street',
    rideHeight: 6,
    stiffness: 90,
    aeroCode: 4,
    aeroMessage: 'Aero is optional and will be most helpful through higher speed corners.',
  },
  {
    id: 'dirt-sand',
    name: 'Dirt or Sand Trails',
    rideHeight: 8,
    stiffness: 100,
    aeroCode: 0,
    aeroMessage: 'No downforce recommendations.',
  },
  {
    id: 'off-road',
    name: 'Cross Country or Off-Road',
    rideHeight: 10,
    stiffness: 95,
    aeroCode: 0,
    aeroMessage: 'No downforce recommendations.',
  },
];
