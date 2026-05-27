import { createSocket, type Socket } from 'node:dgram';
import type { TelemetryData } from '@shared/telemetry';

/**
 * DualSense adaptive trigger feedback via DSX (DualSenseX).
 *
 * Sends UDP JSON packets to the DSX server running on localhost so that the
 * L2 (brake) and R2 (throttle) triggers vibrate proportionally to tyre slip.
 * Ported from Race-Element's TriggerHaptics.cs for Forza Horizon.
 *
 * Protocol: DSX listens on UDP port 6969 (configurable). Each message is a
 * JSON object with an `instructions` array. We use CustomTriggerValue mode
 * with VibrateResistanceB (mode 11) which accepts a frequency + amplitude.
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

export interface DualSenseConfig {
  port: number;
  brakeStrength: number;    // 0–8
  brakeMaxFreq: number;     // Hz, 1–150
  throttleStrength: number; // 0–8
  throttleMaxFreq: number;  // Hz, 1–150
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
    const portChanged = config.port !== this.config.port;
    this.config = config;
    if (portChanged && this.socket) {
      // Socket is connectionless (UDP), port is used at send time, no reconnect needed.
    }
  }

  push(data: TelemetryData): void {
    if (!this.enabled || !this.socket) return;

    if (!data.isRaceOn) {
      // Car not on track — reset triggers once then stop sending.
      if (!this.resetPending) {
        this.resetTriggers();
        this.resetPending = true;
      }
      return;
    }

    this.resetPending = false;

    const throttle = data.accel / 255;
    const brake = data.brake / 255;

    const slipFL = Math.abs(data.tireSlipRatioFrontLeft);
    const slipFR = Math.abs(data.tireSlipRatioFrontRight);
    const slipRL = Math.abs(data.tireSlipRatioRearLeft);
    const slipRR = Math.abs(data.tireSlipRatioRearRight);

    this.sendBrake(brake, slipFL, slipFR, slipRL, slipRR);
    this.sendThrottle(throttle, slipFL, slipFR, slipRL, slipRR);
  }

  destroy(): void {
    this.disable();
    if (this.socket) {
      try { this.socket.close(); } catch { /* ignore */ }
      this.socket = null;
    }
  }

  // ---- Private ------------------------------------------------------------------

  private sendBrake(brake: number, slipFL: number, slipFR: number, slipRL: number, slipRR: number): void {
    if (brake < BRAKE_THRESHOLD) {
      this.sendTrigger(TRIGGER_LEFT, 0, 0);
      return;
    }

    // Front wheels carry braking load → 4× multiplier, capped at 10 each.
    const frontCoeff = Math.min(slipFL * 4, 10) + Math.min(slipFR * 4, 10);
    // Rear wheels → 2× multiplier, capped at 7.5 each.
    const rearCoeff = Math.min(slipRL * 2, 7.5) + Math.min(slipRR * 2, 7.5);
    // Normalise: max possible value is 20 + 15 = 35, we scale by 17.5 so
    // moderate locking gives ~1.0 (saturated) rather than needing full lock.
    const slipPct = Math.min((frontCoeff + rearCoeff) / 17.5, 1);

    const freq = Math.round(this.config.brakeMaxFreq * slipPct);
    const amp = Math.round(this.config.brakeStrength * slipPct);
    this.sendTrigger(TRIGGER_LEFT, freq, amp);
  }

  private sendThrottle(throttle: number, slipFL: number, slipFR: number, slipRL: number, slipRR: number): void {
    if (throttle < THROTTLE_THRESHOLD) {
      this.sendTrigger(TRIGGER_RIGHT, 0, 0);
      return;
    }

    // Throttle-induced slip is dominated by rear wheels → 5× each, capped at 7.5.
    // Front wheel slip still contributes with a 3× multiplier, capped at 5 each.
    const frontCoeff = Math.min(slipFL * 3, 5) + Math.min(slipFR * 3, 5);
    const rearCoeff = Math.min(slipRL * 5, 7.5) + Math.min(slipRR * 5, 7.5);
    // Max = 10 + 15 = 25, normalise by 12.5 → saturates at moderate rear lock.
    const slipPct = Math.min((frontCoeff + rearCoeff) / 12.5, 1);

    const freq = Math.round(this.config.throttleMaxFreq * slipPct);
    const amp = Math.round(this.config.throttleStrength * slipPct);
    this.sendTrigger(TRIGGER_RIGHT, freq, amp);
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
      // Silently ignore send errors — DSX may not be running.
      void err;
    });
  }

  private resetTriggers(): void {
    if (!this.socket) return;
    const packet = JSON.stringify({
      instructions: [
        { type: INSTRUCTION_TYPE_TRIGGER, parameters: [0, TRIGGER_LEFT, TRIGGER_MODE_NORMAL, 0, 0, 0, 0, 0, 0, 0, 0] },
        { type: INSTRUCTION_TYPE_TRIGGER, parameters: [0, TRIGGER_RIGHT, TRIGGER_MODE_NORMAL, 0, 0, 0, 0, 0, 0, 0, 0] },
      ],
    });
    const buf = Buffer.from(packet, 'utf-8');
    this.socket.send(buf, this.config.port, '127.0.0.1', () => {});
  }
}
