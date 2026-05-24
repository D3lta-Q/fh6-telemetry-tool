/**
 * Forza Horizon 6 Data Out telemetry packet structure.
 *
 * The game sends a fixed 324-byte "Car Dash" UDP packet at the game's frame rate.
 * This type mirrors EVERY field in the packet, including ones the current UI does
 * not yet display, so new features can be built without changing the parser/IPC layer.
 *
 * Reference: https://support.forza.net/hc/en-us/articles/51744149102611-Forza-Horizon-6-Data-Out-Documentation
 *
 * Units:
 *  - rpm                 : revolutions/minute
 *  - acceleration        : m/s^2 in car's local frame (X=right, Y=up, Z=forward)
 *  - velocity            : m/s in car's local frame
 *  - angularVelocity     : rad/s (X=pitch, Y=yaw, Z=roll)
 *  - yaw/pitch/roll      : radians
 *  - normalizedSuspensionTravel : 0.0 = max stretch, 1.0 = max compression
 *  - tireSlipRatio       : 0 = full grip, |x| > 1.0 = loss of grip
 *  - wheelRotationSpeed  : rad/s
 *  - wheelOnRumbleStrip  : 0 or 1
 *  - wheelInPuddleDepth  : meters
 *  - surfaceRumble       : 0..1+ rumble intensity
 *  - tireSlipAngle       : radians, lateral slip
 *  - tireCombinedSlip    : combined longitudinal+lateral slip magnitude
 *  - suspensionTravelMeters : meters
 *  - position            : world-space meters
 *  - speed               : m/s
 *  - power               : watts
 *  - torque              : newton-meters
 *  - tireTemp            : degrees Fahrenheit (per Forza convention)
 *  - boost               : varies by car (usually psi or bar)
 *  - fuel                : 0..1 normalized
 *  - distanceTraveled    : meters
 *  - bestLap/lastLap/currentLap/currentRaceTime : seconds
 *  - accel/brake/clutch/handBrake : 0..255
 *  - gear                : 0..10 (0 = reverse on some cars, R is typically 0)
 *  - steer               : -127..127
 */
export interface TelemetryData {
  // --- Sled section (offsets 0..231) ---
  isRaceOn: boolean;
  timestampMS: number;

  engineMaxRpm: number;
  engineIdleRpm: number;
  currentEngineRpm: number;

  accelerationX: number;
  accelerationY: number;
  accelerationZ: number;

  velocityX: number;
  velocityY: number;
  velocityZ: number;

  angularVelocityX: number;
  angularVelocityY: number;
  angularVelocityZ: number;

  yaw: number;
  pitch: number;
  roll: number;

  normalizedSuspensionTravelFrontLeft: number;
  normalizedSuspensionTravelFrontRight: number;
  normalizedSuspensionTravelRearLeft: number;
  normalizedSuspensionTravelRearRight: number;

  tireSlipRatioFrontLeft: number;
  tireSlipRatioFrontRight: number;
  tireSlipRatioRearLeft: number;
  tireSlipRatioRearRight: number;

  wheelRotationSpeedFrontLeft: number;
  wheelRotationSpeedFrontRight: number;
  wheelRotationSpeedRearLeft: number;
  wheelRotationSpeedRearRight: number;

  wheelOnRumbleStripFrontLeft: number;
  wheelOnRumbleStripFrontRight: number;
  wheelOnRumbleStripRearLeft: number;
  wheelOnRumbleStripRearRight: number;

  wheelInPuddleDepthFrontLeft: number;
  wheelInPuddleDepthFrontRight: number;
  wheelInPuddleDepthRearLeft: number;
  wheelInPuddleDepthRearRight: number;

  surfaceRumbleFrontLeft: number;
  surfaceRumbleFrontRight: number;
  surfaceRumbleRearLeft: number;
  surfaceRumbleRearRight: number;

  tireSlipAngleFrontLeft: number;
  tireSlipAngleFrontRight: number;
  tireSlipAngleRearLeft: number;
  tireSlipAngleRearRight: number;

  tireCombinedSlipFrontLeft: number;
  tireCombinedSlipFrontRight: number;
  tireCombinedSlipRearLeft: number;
  tireCombinedSlipRearRight: number;

  suspensionTravelMetersFrontLeft: number;
  suspensionTravelMetersFrontRight: number;
  suspensionTravelMetersRearLeft: number;
  suspensionTravelMetersRearRight: number;

  carOrdinal: number;
  carClass: number;
  carPerformanceIndex: number;
  drivetrainType: number;
  numCylinders: number;

  // --- Horizon-specific section (offsets 232..243), not present in Forza Motorsport ---
  carGroup: number;
  smashableVelDiff: number;
  smashableMass: number;

  // --- Dash section (offsets 244..) ---
  positionX: number;
  positionY: number;
  positionZ: number;

  speed: number;
  power: number;
  torque: number;

  tireTempFrontLeft: number;
  tireTempFrontRight: number;
  tireTempRearLeft: number;
  tireTempRearRight: number;

  boost: number;
  fuel: number;
  distanceTraveled: number;

  bestLap: number;
  lastLap: number;
  currentLap: number;
  currentRaceTime: number;

  lapNumber: number;
  racePosition: number;

  accel: number;
  brake: number;
  clutch: number;
  handBrake: number;
  gear: number;
  steer: number;
  normalizedDrivingLine: number;
  normalizedAIBrakeDifference: number;

  // --- Receive-side metadata (added by the parser, not from the wire) ---
  receivedAt: number;
}

/**
 * Status of the UDP listener as observed by the main process.
 */
export interface ListenerStatus {
  listening: boolean;
  port: number;
  packetsReceived: number;
  lastPacketAt: number | null;
  /** Most recent socket error message, if any. */
  error: string | null;
}

/**
 * App-wide settings persisted to disk via electron-store.
 */
export interface AppSettings {
  /** UDP port the listener binds to. Default 20066. */
  port: number;
  /** Units for the speed display. */
  speedUnit: 'ms' | 'kmh' | 'mph';
  /**
   * Time window (seconds) shared by every chart on the dashboard. Centralizing
   * this lets the user scrub all graphs together from the TopBar without
   * hunting through five separate selectors.
   */
  globalTimeWindow: number;
  /** Series colors for the engine graph. */
  engineColors: {
    rpm: string;
    torque: string;
    power: string;
  };
  /** Show optional graphs alongside the visual widgets. */
  showSuspensionGraph: boolean;
  showWheelGraph: boolean;
  showTireTempGraph: boolean;
  showTireGripGraph: boolean;
  showInputsGraph: boolean;
  /** Scale factor applied to all dashboard panels (0.6–1.4). Default 1. */
  uiScale: number;
  /**
   * Per-panel visibility. Hidden panels are removed from the dashboard grid;
   * remaining panels reflow to fill the freed space.
   */
  visiblePanels: {
    engine: boolean;
    inputs: boolean;
    speed: boolean;
    suspension: boolean;
    wheel: boolean;
    tireTemp: boolean;
    tireGrip: boolean;
  };
}

export const DEFAULT_SETTINGS: AppSettings = {
  port: 20066,
  speedUnit: 'kmh',
  globalTimeWindow: 30,
  engineColors: {
    rpm: '#ff3c1c',
    torque: '#ffd60a',
    power: '#00d4ff',
  },
  showSuspensionGraph: false,
  showWheelGraph: false,
  showTireTempGraph: false,
  showTireGripGraph: false,
  showInputsGraph: false,
  uiScale: 1,
  visiblePanels: {
    engine: true,
    inputs: true,
    speed: true,
    suspension: true,
    wheel: true,
    tireTemp: true,
    tireGrip: true,
  },
};

/**
 * Allowed time window options (seconds) for the global graph window control.
 * Kept as a constant tuple so both the TopBar control and the buffer-sizing
 * math agree on the maximum.
 */
export const TIME_WINDOW_OPTIONS: readonly number[] = [5, 15, 30, 60, 120, 300] as const;
