import { dialog } from 'electron';
import { writeFile } from 'node:fs/promises';
import type { TelemetryData, RecordingStatus } from '@shared/telemetry';
import type { FztSession, TrackFrame, LapInfo, PositionChange, TrackMode } from '@shared/track';
import { isOffRoad, isAirborne, isCollisionImpulse } from '@shared/analysis/frameFlags';

const CAR_CLASS_LETTERS = ['D', 'C', 'B', 'A', 'S1', 'S2', 'X', 'P'];
const MIN_STEP_M = 0.3;

interface CarInfo {
  ordinal: number;
  class: number;
  pi: number;
}

function avgSlip(d: TelemetryData): number {
  return (
    d.tireCombinedSlipFrontLeft +
    d.tireCombinedSlipFrontRight +
    d.tireCombinedSlipRearLeft +
    d.tireCombinedSlipRearRight
  ) / 4;
}

/**
 * Unified recorder that captures both full telemetry packets and derived
 * track frames into a single .fzt v2 file. This means recordings from
 * either the Dashboard or Track tab produce the same file format, playable
 * in both views.
 */
export class Recorder {
  private packets: TelemetryData[] = [];
  private frames: TrackFrame[] = [];
  private laps: LapInfo[] = [];
  private positionChanges: PositionChange[] = [];
  private startedAt: number | null = null;
  private carInfo: CarInfo | null = null;
  private mode: TrackMode = 'free';

  // Track frame derivation state
  private origin: { x: number; y: number; z: number } | null = null;
  private lastX = 0;
  private lastY = 0;
  private lastZ = 0;
  private prevLap = -1;
  private prevRacePos = 0;

  get status(): RecordingStatus {
    return {
      isRecording: this.startedAt !== null,
      startedAt: this.startedAt,
      packetCount: this.packets.length,
    };
  }

  start(mode: TrackMode = 'free'): RecordingStatus {
    this.packets = [];
    this.frames = [];
    this.laps = [];
    this.positionChanges = [];
    this.carInfo = null;
    this.startedAt = Date.now();
    this.mode = mode;
    this.origin = null;
    this.lastX = 0;
    this.lastY = 0;
    this.lastZ = 0;
    this.prevLap = -1;
    this.prevRacePos = 0;
    return this.status;
  }

  push(data: TelemetryData): void {
    if (this.startedAt === null) return;
    this.packets.push(data);

    if (this.carInfo === null && data.isRaceOn && data.carOrdinal > 0) {
      this.carInfo = {
        ordinal: data.carOrdinal,
        class: data.carClass,
        pi: data.carPerformanceIndex,
      };
    }

    if (!data.isRaceOn) return;

    // Derive track frame (mirrors trackStore.pushTelemetry logic)
    if (this.origin === null) {
      this.origin = { x: data.positionX, y: data.positionY, z: data.positionZ };
    }

    const rx = data.positionX - this.origin.x;
    const ry = data.positionY - this.origin.y;
    const rz = -(data.positionZ - this.origin.z);

    // Distance gate
    const dx = rx - this.lastX;
    const dy = ry - this.lastY;
    const dz = rz - this.lastZ;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (this.frames.length > 0 && dist < MIN_STEP_M) return;

    const frame: TrackFrame = {
      t: data.receivedAt,
      x: rx,
      y: ry,
      z: rz,
      yaw: data.yaw,
      pitch: data.pitch,
      roll: data.roll,
      speed: data.speed,
      grip: avgSlip(data),
      throttle: data.accel / 255,
      brake: data.brake / 255,
      rumble:
        data.wheelOnRumbleStripFrontLeft > 0.5 ||
        data.wheelOnRumbleStripFrontRight > 0.5 ||
        data.wheelOnRumbleStripRearLeft > 0.5 ||
        data.wheelOnRumbleStripRearRight > 0.5,
      puddle:
        data.wheelInPuddleDepthFrontLeft > 0.02 ||
        data.wheelInPuddleDepthFrontRight > 0.02 ||
        data.wheelInPuddleDepthRearLeft > 0.02 ||
        data.wheelInPuddleDepthRearRight > 0.02,
      offRoad: isOffRoad(data),
      airborne: isAirborne(data),
      collision: isCollisionImpulse(data),
      racePos: data.racePosition,
      lapNumber: data.lapNumber,
      currentLap: data.currentLap,
      bestLap: data.bestLap,
      lastLap: data.lastLap,
      currentRaceTime: data.currentRaceTime,
    };

    this.frames.push(frame);
    const frameIndex = this.frames.length - 1;

    this.lastX = rx;
    this.lastY = ry;
    this.lastZ = rz;

    // Lap detection
    if (this.mode === 'race' && data.lapNumber !== this.prevLap) {
      if (this.prevLap >= 0) {
        this.laps.push({ lapNumber: this.prevLap + 1, startFrame: frameIndex, lapTime: data.lastLap });
      }
      this.prevLap = data.lapNumber;
    }

    // Position change detection
    if (
      this.mode === 'race' &&
      data.racePosition > 0 &&
      this.prevRacePos > 0 &&
      data.racePosition !== this.prevRacePos
    ) {
      this.positionChanges.push({ frameIndex, x: rx, y: ry, z: rz, from: this.prevRacePos, to: data.racePosition });
    }
    if (data.racePosition > 0) this.prevRacePos = data.racePosition;
  }

  /** Returns the completed session without showing a save dialog. */
  buildSession(): FztSession | null {
    if (this.startedAt === null) return null;

    return {
      version: 2,
      mode: this.mode,
      startedAt: this.startedAt,
      endedAt: Date.now(),
      origin: this.origin ?? { x: 0, y: 0, z: 0 },
      frames: this.frames,
      laps: this.laps,
      positionChanges: this.positionChanges,
      packets: this.packets,
    };
  }

  async stop(): Promise<RecordingStatus> {
    if (this.startedAt === null) return this.status;

    const session = this.buildSession()!;
    const car = this.carInfo;

    this.startedAt = null;
    this.packets = [];
    this.frames = [];
    this.laps = [];
    this.positionChanges = [];
    this.carInfo = null;
    this.origin = null;

    const defaultPath = buildDefaultFilename(session.startedAt, car);

    const result = await dialog.showSaveDialog({
      title: 'Save Telemetry Recording',
      defaultPath,
      filters: [{ name: 'Forza Telemetry Session', extensions: ['fzt'] }],
    });

    if (!result.canceled && result.filePath) {
      await writeFile(result.filePath, JSON.stringify(session));
    }

    return this.status;
  }

  setMode(mode: TrackMode): void {
    this.mode = mode;
  }

  abort(): void {
    this.startedAt = null;
    this.packets = [];
    this.frames = [];
    this.laps = [];
    this.positionChanges = [];
    this.carInfo = null;
    this.origin = null;
  }
}

function buildDefaultFilename(startedAt: number, car: CarInfo | null): string {
  const d = new Date(startedAt);
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const DD = String(d.getDate()).padStart(2, '0');
  const YYYY = d.getFullYear();
  const HH = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const SS = String(d.getSeconds()).padStart(2, '0');
  const timestamp = `${MM}-${DD}-${YYYY}_${HH}-${mm}-${SS}`;

  if (car !== null) {
    const classLetter = CAR_CLASS_LETTERS[car.class] ?? String(car.class);
    return `forza-session-${car.ordinal}-${classLetter}${car.pi}-${timestamp}.fzt`;
  }
  return `forza-session-unknown-${timestamp}.fzt`;
}
