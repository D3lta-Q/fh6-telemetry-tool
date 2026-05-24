import { useRef } from 'react';
import { useTelemetryStore } from '../../store/telemetryStore';
import { useAnimationTick } from '../../hooks/useAnimationTick';

/**
 * Four wheels with live rotation. We integrate angular velocity over real
 * elapsed time on every animation frame, so the visualization keeps spinning
 * smoothly between UDP packets and looks correct at any sample rate.
 *
 * The wheels have spoke patterns so rotation is actually visible. A static
 * wheel disc with no markings would not look like it was spinning.
 */
export function WheelVisual() {
  useAnimationTick();
  const latest = useTelemetryStore.getState().latest;

  // Persistent angle accumulators - one per corner.
  const angles = useRef({ fl: 0, fr: 0, rl: 0, rr: 0 });
  const lastTimeRef = useRef<number | null>(null);

  const now = performance.now() / 1000;
  const dt = lastTimeRef.current === null ? 0 : Math.max(0, now - lastTimeRef.current);
  lastTimeRef.current = now;

  // The wire units for wheel rotation speed are radians per second.
  const flSpd = latest?.wheelRotationSpeedFrontLeft ?? 0;
  const frSpd = latest?.wheelRotationSpeedFrontRight ?? 0;
  const rlSpd = latest?.wheelRotationSpeedRearLeft ?? 0;
  const rrSpd = latest?.wheelRotationSpeedRearRight ?? 0;

  // Visual scaling: tire rotation is too fast to follow at high speed if we
  // use the literal angular velocity. We cap the visual rate so the wheels
  // remain readable. The numeric readout below shows true rad/s.
  const visualScale = 0.25;
  angles.current.fl = (angles.current.fl + flSpd * dt * visualScale) % (Math.PI * 2);
  angles.current.fr = (angles.current.fr + frSpd * dt * visualScale) % (Math.PI * 2);
  angles.current.rl = (angles.current.rl + rlSpd * dt * visualScale) % (Math.PI * 2);
  angles.current.rr = (angles.current.rr + rrSpd * dt * visualScale) % (Math.PI * 2);

  return (
    <div className="w-full h-full flex items-center justify-center">
      <svg viewBox="0 0 320 220" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
        {/* Car body silhouette */}
        <image
          href="/car-icon.svg"
          x="80"
          y="40"
          width="160"
          height="140"
          preserveAspectRatio="xMidYMid meet"
          style={{ filter: 'invert(1)', opacity: 0.25 }}
        />

        <Wheel x={50} y={60} label="FL" angle={angles.current.fl} speed={flSpd} />
        <Wheel x={270} y={60} label="FR" angle={angles.current.fr} speed={frSpd} />
        <Wheel x={50} y={160} label="RL" angle={angles.current.rl} speed={rlSpd} />
        <Wheel x={270} y={160} label="RR" angle={angles.current.rr} speed={rrSpd} />
      </svg>
    </div>
  );
}

function Wheel({
  x,
  y,
  label,
  angle,
  speed,
}: {
  x: number;
  y: number;
  label: string;
  angle: number;
  speed: number;
}) {
  const r = 18;
  const deg = (angle * 180) / Math.PI;
  // Color intensifies with absolute speed
  const intensity = Math.min(1, Math.abs(speed) / 100);
  const color = intensity > 0.05 ? '#00d4ff' : '#5a5b62';
  return (
    <g transform={`translate(${x}, ${y})`}>
      <circle cx="0" cy="0" r={r + 2} fill="#0f1014" stroke="#26272d" strokeWidth="1" />
      <g transform={`rotate(${deg})`}>
        <circle cx="0" cy="0" r={r} fill="#15161a" stroke={color} strokeWidth="1.5" />
        {/* Spokes - five for visual asymmetry which reads as rotation better than even counts */}
        {[0, 72, 144, 216, 288].map((a) => (
          <line
            key={a}
            x1="0"
            y1="0"
            x2={Math.cos((a * Math.PI) / 180) * (r - 3)}
            y2={Math.sin((a * Math.PI) / 180) * (r - 3)}
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        ))}
        <circle cx="0" cy="0" r="3" fill={color} />
      </g>
      <text
        x="0"
        y={-r - 8}
        textAnchor="middle"
        fill="#8b8c93"
        fontSize="9"
        fontFamily="Geist Mono, monospace"
        letterSpacing="0.15em"
      >
        {label}
      </text>
      <text
        x="0"
        y={r + 14}
        textAnchor="middle"
        fill={color}
        fontSize="9"
        fontFamily="Geist Mono, monospace"
      >
        {speed.toFixed(0)} rad/s
      </text>
    </g>
  );
}
