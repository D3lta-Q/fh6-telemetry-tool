import { create } from 'zustand';
import type { ListenerStatus, TelemetryData } from '@shared/telemetry';
import { RingBuffer } from '../lib/ringBuffer';

/**
 * Buffer capacity sized for the longest time window users can pick (5 min) at
 * Forza's worst-case packet rate (~240 Hz). 5 * 60 * 240 = 72,000 samples - we
 * round up to 80k for headroom. RingBuffer pre-allocates this once with typed
 * arrays so the cost is paid up front rather than on the hot path.
 *
 * Memory: per channel ~640 KB (Float64), so a 4-channel buffer is ~2.5 MB.
 * Across our seven buffers (engine, speed, suspension, wheel, tireTemp,
 * tireGrip, inputs) that's ~70 MB committed. Acceptable for a desktop app.
 */
const BUFFER_CAPACITY = 80_000;

/**
 * Telemetry store - one big Zustand atom containing:
 *  - the most recent parsed packet (the "live" frame, used by every gauge)
 *  - the listener status from the main process
 *  - ring buffers for every series we plot, EACH a stable object reference
 *    so consumers can subscribe to a specific buffer without triggering
 *    full re-renders.
 *
 * IMPORTANT: We don't store every historical packet in React state. At 60+ Hz
 * that would re-render the entire app 60+ times per second. Instead we mutate
 * the ring buffers in place and bump a single `frame` counter that gauges
 * subscribe to. Chart components then poll their buffers on a rAF tick.
 */

interface TelemetryStoreState {
  latest: TelemetryData | null;
  status: ListenerStatus | null;
  /** Monotonic frame counter, incremented every time `latest` updates. */
  frame: number;

  // Ring buffers - constructed once, mutated in place.
  engineBuffer: RingBuffer;
  speedBuffer: RingBuffer;
  suspensionBuffer: RingBuffer;
  wheelBuffer: RingBuffer;
  tireTempBuffer: RingBuffer;
  tireGripBuffer: RingBuffer;
  inputsBuffer: RingBuffer;

  pushPacket: (data: TelemetryData) => void;
  setStatus: (status: ListenerStatus | null) => void;
  reset: () => void;
}

export const useTelemetryStore = create<TelemetryStoreState>((set, get) => ({
  latest: null,
  status: null,
  frame: 0,

  engineBuffer: new RingBuffer(3, BUFFER_CAPACITY),
  speedBuffer: new RingBuffer(1, BUFFER_CAPACITY),
  suspensionBuffer: new RingBuffer(4, BUFFER_CAPACITY),
  wheelBuffer: new RingBuffer(4, BUFFER_CAPACITY),
  tireTempBuffer: new RingBuffer(4, BUFFER_CAPACITY),
  tireGripBuffer: new RingBuffer(4, BUFFER_CAPACITY),
  // Inputs: throttle, brake, handBrake, steer. We normalize all four to a
  // consistent unit at push time so charting is straightforward.
  inputsBuffer: new RingBuffer(4, BUFFER_CAPACITY),

  pushPacket: (data) => {
    const t = data.receivedAt / 1000;

    // Only buffer samples while the player is actually driving. When IsRaceOn
    // is 0 the game still sends packets in some menus, but the values are
    // stale or zeroed - polluting the graphs.
    if (data.isRaceOn) {
      const s = get();
      s.engineBuffer.push(t, [data.currentEngineRpm, data.torque, data.power]);
      s.speedBuffer.push(t, [data.speed]);
      s.suspensionBuffer.push(t, [
        data.normalizedSuspensionTravelFrontLeft,
        data.normalizedSuspensionTravelFrontRight,
        data.normalizedSuspensionTravelRearLeft,
        data.normalizedSuspensionTravelRearRight,
      ]);
      s.wheelBuffer.push(t, [
        data.wheelRotationSpeedFrontLeft,
        data.wheelRotationSpeedFrontRight,
        data.wheelRotationSpeedRearLeft,
        data.wheelRotationSpeedRearRight,
      ]);
      s.tireTempBuffer.push(t, [
        data.tireTempFrontLeft,
        data.tireTempFrontRight,
        data.tireTempRearLeft,
        data.tireTempRearRight,
      ]);
      // Tire grip: combined slip per corner. 0 = full grip, ≥1 = sliding.
      // We store raw slip; the visual converts to a 0-100% grip value with
      // appropriate coloring.
      s.tireGripBuffer.push(t, [
        data.tireCombinedSlipFrontLeft,
        data.tireCombinedSlipFrontRight,
        data.tireCombinedSlipRearLeft,
        data.tireCombinedSlipRearRight,
      ]);
      // Inputs: normalize to 0..1 (or -1..1 for steering) so all four series
      // graph on the same Y scale. Throttle/Brake/Handbrake are 0..255 raw;
      // Steer is -127..127 raw.
      s.inputsBuffer.push(t, [
        data.accel / 255,
        data.brake / 255,
        data.handBrake / 255,
        data.steer / 127,
      ]);
    }

    set((state) => ({ latest: data, frame: state.frame + 1 }));
  },

  setStatus: (status) => set({ status }),

  reset: () => {
    const s = get();
    s.engineBuffer.clear();
    s.speedBuffer.clear();
    s.suspensionBuffer.clear();
    s.wheelBuffer.clear();
    s.tireTempBuffer.clear();
    s.tireGripBuffer.clear();
    s.inputsBuffer.clear();
    set({ latest: null, frame: 0 });
  },
}));
