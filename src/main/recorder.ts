import { dialog } from 'electron';
import { writeFile } from 'node:fs/promises';
import type { TelemetryData, RecordingStatus } from '@shared/telemetry';

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

  get status(): RecordingStatus {
    return {
      isRecording: this.startedAt !== null,
      startedAt: this.startedAt,
      packetCount: this.packets.length,
    };
  }

  start(): RecordingStatus {
    this.packets = [];
    this.startedAt = Date.now();
    return this.status;
  }

  push(data: TelemetryData): void {
    if (this.startedAt !== null) {
      this.packets.push(data);
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

    this.startedAt = null;
    this.packets = [];

    const timestamp = new Date(session.startedAt)
      .toISOString()
      .slice(0, 19)
      .replace(/:/g, '-');

    const result = await dialog.showSaveDialog({
      title: 'Save Telemetry Recording',
      defaultPath: `forza-session-${timestamp}.fzr`,
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
  }
}
