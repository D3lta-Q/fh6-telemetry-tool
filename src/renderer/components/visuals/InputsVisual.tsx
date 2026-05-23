import { useTelemetryStore } from '../../store/telemetryStore';
import { useAnimationTick } from '../../hooks/useAnimationTick';

/**
 * Live display of the driver's controller/wheel inputs.
 *
 * Layout: stacked horizontal bars for throttle (lime), brake (red), and
 * handbrake (yellow), each labeled with a percentage. Below them, a centered
 * steering indicator showing position from full-left (-100%) to full-right
 * (+100%) with a tick at center.
 *
 * Why bars and not pedals? Bars convey the proportional value at a glance,
 * which is what matters for understanding inputs. Pedal-style visuals look
 * cool but waste pixels.
 */
export function InputsVisual() {
  useAnimationTick();
  const latest = useTelemetryStore.getState().latest;

  // Forza's raw ranges: accel/brake/clutch/handBrake are 0..255, steer is -127..127.
  const throttle = (latest?.accel ?? 0) / 255;
  const brake = (latest?.brake ?? 0) / 255;
  const handBrake = (latest?.handBrake ?? 0) / 255;
  const steer = (latest?.steer ?? 0) / 127; // -1..1

  return (
    <div className="w-full h-full flex flex-col gap-3 px-3 py-2">
      <InputBar label="THROTTLE" value={throttle} color="#a3ff12" />
      <InputBar label="BRAKE" value={brake} color="#ff3c1c" />
      <InputBar label="HANDBRAKE" value={handBrake} color="#ffd60a" />
      <SteeringBar value={steer} />
    </div>
  );
}

function InputBar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.max(0, Math.min(1, value));
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-text-dim">
          {label}
        </span>
        <span
          className="text-xs font-mono tabular-nums"
          style={{ color: pct > 0.02 ? color : '#5a5b62' }}
        >
          {(pct * 100).toFixed(0)}%
        </span>
      </div>
      <div className="relative h-2 rounded-sm bg-bg-input border border-border-muted overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 transition-[width] duration-75 ease-linear"
          style={{
            width: `${pct * 100}%`,
            background: `linear-gradient(90deg, ${color}30, ${color})`,
          }}
        />
      </div>
    </div>
  );
}

/**
 * Steering: bidirectional bar centered at 0, fills LEFT (red-ish lean) or
 * RIGHT (cyan-ish lean) from the middle.
 */
function SteeringBar({ value }: { value: number }) {
  const v = Math.max(-1, Math.min(1, value));
  const magnitude = Math.abs(v);
  // Positive = right, negative = left.
  const isRight = v >= 0;
  const fillPct = magnitude * 50; // each side takes 50% of bar width

  const color = '#00d4ff';

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-text-dim">
          STEERING
        </span>
        <span
          className="text-xs font-mono tabular-nums"
          style={{ color: magnitude > 0.02 ? color : '#5a5b62' }}
        >
          {v === 0 ? '0°' : `${isRight ? '→' : '←'} ${(magnitude * 100).toFixed(0)}%`}
        </span>
      </div>
      <div className="relative h-2 rounded-sm bg-bg-input border border-border-muted overflow-hidden">
        {/* Center tick */}
        <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
        {/* Fill from center, growing leftward or rightward */}
        {isRight ? (
          <div
            className="absolute inset-y-0 left-1/2 transition-[width] duration-75 ease-linear"
            style={{
              width: `${fillPct}%`,
              background: `linear-gradient(90deg, ${color}30, ${color})`,
            }}
          />
        ) : (
          <div
            className="absolute inset-y-0 right-1/2 transition-[width] duration-75 ease-linear"
            style={{
              width: `${fillPct}%`,
              background: `linear-gradient(270deg, ${color}30, ${color})`,
            }}
          />
        )}
      </div>
    </div>
  );
}
