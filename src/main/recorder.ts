import { dialog } from 'electron';
import { writeFile } from 'node:fs/promises';
import type { TelemetryData, RecordingStatus } from '@shared/telemetry';

const CAR_CLASS_LETTERS = ['D', 'C', 'B', 'A', 'S1', 'S2', 'X', 'P'];

interface CarInfo {
  ordinal: number;
  class: number;
  pi: number;
}

interface FzrSession {
  version: 1;
  startedAt: number;
  endedAt: number;
  packets: TelemetryData[];
}

/**
 * Collects telemetry packets during a recording session and saves them to a
 * `.fzr` JSON file when the user stops recording.
 *
 * The `.fzr` format is a plain JSON object containing a version field,
 * session timestamps, and the full packet array. This keeps the file
 * self-contained and easy to parse for the future playback feature.
 */
export class Recorder {
  private packets: TelemetryData[] = [];
  private startedAt: number | null = null;
  private carInfo: CarInfo | null = null;

  get status(): RecordingStatus {
    return {
      isRecording: this.startedAt !== null,
      startedAt: this.startedAt,
      packetCount: this.packets.length,
    };
  }

  start(): RecordingStatus {
    this.packets = [];
    this.carInfo = null;
    this.startedAt = Date.now();
    return this.status;
  }

  push(data: TelemetryData): void {
    if (this.startedAt === null) return;
    this.packets.push(data);
    // Latch car info from the first packet where the game reports a valid car.
    if (this.carInfo === null && data.isRaceOn && data.carOrdinal > 0) {
      this.carInfo = {
        ordinal: data.carOrdinal,
        class: data.carClass,
        pi: data.carPerformanceIndex,
      };
    }
  }

  async stop(): Promise<RecordingStatus> {
    if (this.startedAt === null) return this.status;

    const session: FzrSession = {
      version: 1,
      startedAt: this.startedAt,
      endedAt: Date.now(),
      packets: this.packets,
    };

    const car = this.carInfo;
    this.startedAt = null;
    this.packets = [];
    this.carInfo = null;

    const defaultPath = buildDefaultFilename(session.startedAt, car);

    const result = await dialog.showSaveDialog({
      title: 'Save Telemetry Recording',
      defaultPath,
      filters: [{ name: 'Forza Telemetry Recording', extensions: ['fzr'] }],
    });

    if (!result.canceled && result.filePath) {
      await writeFile(result.filePath, JSON.stringify(session));
    }

    return this.status;
  }

  abort(): void {
    this.startedAt = null;
    this.packets = [];
    this.carInfo = null;
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
    return `forza-session-${car.ordinal}-${classLetter}${car.pi}-${timestamp}.fzr`;
  }
  return `forza-session-unknown-${timestamp}.fzr`;
}
