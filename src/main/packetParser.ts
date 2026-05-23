import type { TelemetryData } from '@shared/telemetry';

/**
 * The exact byte layout of the FH6 "Car Dash" UDP packet.
 *
 * Total: 324 bytes, little-endian.
 *
 * The first 232 bytes are the same "Sled" payload used since Forza Motorsport 7.
 * After NumCylinders (offset 228) and BEFORE PositionX, Horizon inserts three
 * extra fields (CarGroup, SmashableVelDiff, SmashableMass) that Motorsport
 * doesn't have. The Dash payload then continues. FH6 omits TireWear and
 * TrackOrdinal that Forza Motorsport (2023) added.
 *
 * Every offset below is the byte position of the start of that field.
 *
 * If a future game update changes the layout, only this file needs to change.
 */

/** Expected packet size in bytes. */
export const FH6_PACKET_SIZE = 324;

/**
 * Parse a 324-byte FH6 UDP packet into a typed TelemetryData object.
 *
 * Returns null if the buffer length is wrong, so the caller can decide whether
 * to log/drop the packet. Forza always sends 324 bytes, so a different length
 * means either Sled mode in a future variant or a malformed sender.
 */
export function parseForzaPacket(buf: Buffer, receivedAt: number): TelemetryData | null {
  if (buf.length !== FH6_PACKET_SIZE) {
    return null;
  }

  // Buffer.readFloatLE / readInt32LE / readUInt32LE etc. all read little-endian,
  // which is the wire format Forza uses on both Windows and Xbox.
  const f32 = (off: number) => buf.readFloatLE(off);
  const s32 = (off: number) => buf.readInt32LE(off);
  const u32 = (off: number) => buf.readUInt32LE(off);
  const u16 = (off: number) => buf.readUInt16LE(off);
  const u8 = (off: number) => buf.readUInt8(off);
  const s8 = (off: number) => buf.readInt8(off);

  return {
    // --- Sled (0..231) ---
    isRaceOn: s32(0) === 1,
    timestampMS: u32(4),

    engineMaxRpm: f32(8),
    engineIdleRpm: f32(12),
    currentEngineRpm: f32(16),

    accelerationX: f32(20),
    accelerationY: f32(24),
    accelerationZ: f32(28),

    velocityX: f32(32),
    velocityY: f32(36),
    velocityZ: f32(40),

    angularVelocityX: f32(44),
    angularVelocityY: f32(48),
    angularVelocityZ: f32(52),

    yaw: f32(56),
    pitch: f32(60),
    roll: f32(64),

    normalizedSuspensionTravelFrontLeft: f32(68),
    normalizedSuspensionTravelFrontRight: f32(72),
    normalizedSuspensionTravelRearLeft: f32(76),
    normalizedSuspensionTravelRearRight: f32(80),

    tireSlipRatioFrontLeft: f32(84),
    tireSlipRatioFrontRight: f32(88),
    tireSlipRatioRearLeft: f32(92),
    tireSlipRatioRearRight: f32(96),

    wheelRotationSpeedFrontLeft: f32(100),
    wheelRotationSpeedFrontRight: f32(104),
    wheelRotationSpeedRearLeft: f32(108),
    wheelRotationSpeedRearRight: f32(112),

    wheelOnRumbleStripFrontLeft: s32(116),
    wheelOnRumbleStripFrontRight: s32(120),
    wheelOnRumbleStripRearLeft: s32(124),
    wheelOnRumbleStripRearRight: s32(128),

    wheelInPuddleDepthFrontLeft: f32(132),
    wheelInPuddleDepthFrontRight: f32(136),
    wheelInPuddleDepthRearLeft: f32(140),
    wheelInPuddleDepthRearRight: f32(144),

    surfaceRumbleFrontLeft: f32(148),
    surfaceRumbleFrontRight: f32(152),
    surfaceRumbleRearLeft: f32(156),
    surfaceRumbleRearRight: f32(160),

    tireSlipAngleFrontLeft: f32(164),
    tireSlipAngleFrontRight: f32(168),
    tireSlipAngleRearLeft: f32(172),
    tireSlipAngleRearRight: f32(176),

    tireCombinedSlipFrontLeft: f32(180),
    tireCombinedSlipFrontRight: f32(184),
    tireCombinedSlipRearLeft: f32(188),
    tireCombinedSlipRearRight: f32(192),

    suspensionTravelMetersFrontLeft: f32(196),
    suspensionTravelMetersFrontRight: f32(200),
    suspensionTravelMetersRearLeft: f32(204),
    suspensionTravelMetersRearRight: f32(208),

    carOrdinal: s32(212),
    carClass: s32(216),
    carPerformanceIndex: s32(220),
    drivetrainType: s32(224),
    numCylinders: s32(228),

    // --- Horizon-specific (232..243) ---
    carGroup: u32(232),
    smashableVelDiff: f32(236),
    smashableMass: f32(240),

    // --- Dash (244..) ---
    positionX: f32(244),
    positionY: f32(248),
    positionZ: f32(252),

    speed: f32(256),
    power: f32(260),
    torque: f32(264),

    tireTempFrontLeft: f32(268),
    tireTempFrontRight: f32(272),
    tireTempRearLeft: f32(276),
    tireTempRearRight: f32(280),

    boost: f32(284),
    fuel: f32(288),
    distanceTraveled: f32(292),

    bestLap: f32(296),
    lastLap: f32(300),
    currentLap: f32(304),
    currentRaceTime: f32(308),

    lapNumber: u16(312),
    racePosition: u8(314),

    accel: u8(315),
    brake: u8(316),
    clutch: u8(317),
    handBrake: u8(318),
    gear: u8(319),
    steer: s8(320),
    normalizedDrivingLine: s8(321),
    normalizedAIBrakeDifference: s8(322),

    // byte 323 is unused/padding in the FH6 layout.

    receivedAt,
  };
}
