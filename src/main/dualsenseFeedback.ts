import { createSocket, type Socket } from 'node:dgram';
import type { TelemetryData } from '@shared/telemetry';

/**
 * DualSense adaptive trigger feedback via DSX (DualSenseX).
 *
 * Sends UDP JSON packets to the DSX server running on localhost so that the
 * L2 (brake) and R2 (throttle) triggers vibrate proportionally to configurable
 * telemetry sources. Sources are summed and clamped to 1 before being mapped
 * to frequency and amplitude.
 *
 * InstructionType: TriggerUpdate = 1
 * Trigger enum:    Left = 1 (L2),  Right = 2 (R2)
 * TriggerMode:     CustomTriggerValue = 12
 * CustomMode:      VibrateResistanceB = 11
 */

const TRIGGER_LEFT = 1;
const TRIGGER_RIGHT = 2;
const TRIGGER_MODE_CUSTOM = 12;
const CUSTOM_MODE_VIBRATE_RESISTANCE_B = 11;
const TRIGGER_MODE_NORMAL = 0;
// DSX UDP API: InstructionType.TriggerUpdate = 1 (not 3, which is PlayerLED)
const INSTRUCTION_TYPE_TRIGGER = 1;

// Minimum brake/throttle input (0–1) required to activate feedback.
const BRAKE_THRESHOLD = 0.03;
const THROTTLE_THRESHOLD = 0.03;

// Speed reference for normalisation: ~290 km/h in m/s.
const SPEED_REF = 80;

export interface DualSenseSourceWeight {
  enabled: boolean;
  strength: number; // 0–1
}

export interface DualSenseConfig {
  port: number;
  brakeStrength: number;    // 0–8
  brakeMaxFreq: number;     // Hz, 1–150
  throttleStrength: number; // 0–8
  throttleMaxFreq: number;  // Hz, 1–150
  sources: {
    slip:    DualSenseSourceWeight;
    surface: DualSenseSourceWeight;
    rpm:     DualSenseSourceWeight;
    speed:   DualSenseSourceWeight;
  };
}

export class DualSenseFeedback {
  private socket: Socket | null = null;
  private config: DualSenseConfig;
  private enabled = false;
  private resetPending = false;

  constructor(config: DualSenseConfig) {
    this.config = config;
  }

  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    this.resetPending = false;
    if (!this.socket) {
      this.socket = createSocket('udp4');
      this.socket.unref();
    }
  }

  disable(): void {
    if (!this.enabled) return;
    this.enabled = false;
    this.resetTriggers();
  }

  updateConfig(config: DualSenseConfig): void {
    this.config = config;
  }

  push(data: TelemetryData): void {
    if (!this.enabled || !this.socket) return;

    if (!data.isRaceOn) {
      if (!this.resetPending) {
        this.resetTriggers();
        this.resetPending = true;
      }
      return;
    }

    this.resetPending = false;
    this.sendBrake(data);
    this.sendThrottle(data);
  }

  destroy(): void {
    this.disable();
    if (this.socket) {
      try { this.socket.close(); } catch { /* ignore */ }
      this.socket = null;
    }
  }

  // ---- Private ------------------------------------------------------------------

  private sendBrake(data: TelemetryData): void {
    const brake = data.brake / 255;
    if (brake < BRAKE_THRESHOLD) {
      this.sendTrigger(TRIGGER_LEFT, 0, 0);
      return;
    }

    const { sources } = this.config;
    let total = 0;

    if (sources.slip.enabled) {
      const fl = Math.abs(data.tireSlipRatioFrontLeft);
      const fr = Math.abs(data.tireSlipRatioFrontRight);
      const rl = Math.abs(data.tireSlipRatioRearLeft);
      const rr = Math.abs(data.tireSlipRatioRearRight);
      // Front wheels carry braking load → 4× multiplier; rear → 2×.
      const front = Math.min(fl * 4, 10) + Math.min(fr * 4, 10);
      const rear  = Math.min(rl * 2, 7.5) + Math.min(rr * 2, 7.5);
      total += Math.min((front + rear) / 17.5, 1) * sources.slip.strength;
    }

    if (sources.surface.enabled) {
      const avg = (data.surfaceRumbleFrontLeft + data.surfaceRumbleFrontRight +
                   data.surfaceRumbleRearLeft  + data.surfaceRumbleRearRight) / 4;
      total += Math.min(avg, 1) * sources.surface.strength;
    }

    if (sources.rpm.enabled && data.engineMaxRpm > 0) {
      total += Math.min(data.currentEngineRpm / data.engineMaxRpm, 1) * sources.rpm.strength;
    }

    if (sources.speed.enabled) {
      total += Math.min(data.speed / SPEED_REF, 1) * sources.speed.strength;
    }

    const pct = Math.min(total, 1);
    this.sendTrigger(TRIGGER_LEFT, Math.round(this.config.brakeMaxFreq * pct), Math.round(this.config.brakeStrength * pct));
  }

  private sendThrottle(data: TelemetryData): void {
    const throttle = data.accel / 255;
    if (throttle < THROTTLE_THRESHOLD) {
      this.sendTrigger(TRIGGER_RIGHT, 0, 0);
      return;
    }

    const { sources } = this.config;
    let total = 0;

    if (sources.slip.enabled) {
      const fl = Math.abs(data.tireSlipRatioFrontLeft);
      const fr = Math.abs(data.tireSlipRatioFrontRight);
      const rl = Math.abs(data.tireSlipRatioRearLeft);
      const rr = Math.abs(data.tireSlipRatioRearRight);
      // Throttle-induced slip dominated by rear wheels → 5×; front → 3×.
      const front = Math.min(fl * 3, 5) + Math.min(fr * 3, 5);
      const rear  = Math.min(rl * 5, 7.5) + Math.min(rr * 5, 7.5);
      total += Math.min((front + rear) / 12.5, 1) * sources.slip.strength;
    }

    if (sources.surface.enabled) {
      const avg = (data.surfaceRumbleFrontLeft + data.surfaceRumbleFrontRight +
                   data.surfaceRumbleRearLeft  + data.surfaceRumbleRearRight) / 4;
      total += Math.min(avg, 1) * sources.surface.strength;
    }

    if (sources.rpm.enabled && data.engineMaxRpm > 0) {
      total += Math.min(data.currentEngineRpm / data.engineMaxRpm, 1) * sources.rpm.strength;
    }

    if (sources.speed.enabled) {
      total += Math.min(data.speed / SPEED_REF, 1) * sources.speed.strength;
    }

    const pct = Math.min(total, 1);
    this.sendTrigger(TRIGGER_RIGHT, Math.round(this.config.throttleMaxFreq * pct), Math.round(this.config.throttleStrength * pct));
  }

  private sendTrigger(trigger: number, frequency: number, amplitude: number): void {
    if (!this.socket) return;

    const mode = frequency === 0 && amplitude === 0
      ? TRIGGER_MODE_NORMAL
      : TRIGGER_MODE_CUSTOM;

    const params = mode === TRIGGER_MODE_NORMAL
      ? [0, trigger, TRIGGER_MODE_NORMAL, 0, 0, 0, 0, 0, 0, 0, 0]
      : [0, trigger, TRIGGER_MODE_CUSTOM, CUSTOM_MODE_VIBRATE_RESISTANCE_B, frequency, amplitude, 0, 0, 0, 0, 0];

    const packet = JSON.stringify({
      instructions: [{ type: INSTRUCTION_TYPE_TRIGGER, parameters: params }],
    });

    const buf = Buffer.from(packet, 'utf-8');
    this.socket.send(buf, this.config.port, '127.0.0.1', (err) => {
      void err;
    });
  }

  private resetTriggers(): void {
    if (!this.socket) return;
    const packet = JSON.stringify({
      instructions: [
        { type: INSTRUCTION_TYPE_TRIGGER, parameters: [0, TRIGGER_LEFT,  TRIGGER_MODE_NORMAL, 0, 0, 0, 0, 0, 0, 0, 0] },
        { type: INSTRUCTION_TYPE_TRIGGER, parameters: [0, TRIGGER_RIGHT, TRIGGER_MODE_NORMAL, 0, 0, 0, 0, 0, 0, 0, 0] },
      ],
    });
    const buf = Buffer.from(packet, 'utf-8');
    this.socket.send(buf, this.config.port, '127.0.0.1', () => {});
  }
}
