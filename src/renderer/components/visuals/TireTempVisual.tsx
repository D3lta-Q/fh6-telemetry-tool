import { useTelemetryStore } from '../../store/telemetryStore';
import { useAnimationTick } from '../../hooks/useAnimationTick';
import { tireTempColor } from '../../lib/units';

/**
 * Four tire heat indicators. Each tire is drawn as a rounded rectangle filled
 * with a color from the cold->optimal->hot gradient, plus the live temperature
 * in degrees F (Forza's native unit).
 */
export function TireTempVisual() {
  useAnimationTick();
  const latest = useTelemetryStore.getState().latest;

  const fl = latest?.tireTempFrontLeft ?? 0;
  const fr = latest?.tireTempFrontRight ?? 0;
  const rl = latest?.tireTempRearLeft ?? 0;
  const rr = latest?.tireTempRearRight ?? 0;

  return (
    <div className="w-full h-full flex items-center justify-center">
      <svg viewBox="0 0 320 220" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
        {/* Car body silhouette */}
        <rect
          x="80"
          y="40"
          width="160"
          height="140"
          rx="22"
          ry="22"
          fill="#15161a"
          stroke="#3a3b42"
          strokeWidth="1"
        />
        <text
          x="160"
          y="115"
          textAnchor="middle"
          fill="#5a5b62"
          fontSize="9"
          fontFamily="Geist Mono, monospace"
          letterSpacing="0.2em"
        >
          FRONT
        </text>

        <Tire x={50} y={50} label="FL" tempF={fl} />
        <Tire x={270} y={50} label="FR" tempF={fr} />
        <Tire x={50} y={150} label="RL" tempF={rl} />
        <Tire x={270} y={150} label="RR" tempF={rr} />

        {/* Gradient legend strip at the bottom (centered: 320 - 200 / 2 = 60) */}
        <Legend x={60} y={195} width={200} />
      </svg>
    </div>
  );
}

function Tire({ x, y, label, tempF }: { x: number; y: number; label: string; tempF: number }) {
  const color = tireTempColor(tempF);
  return (
    <g transform={`translate(${x}, ${y})`}>
      {/* Tire shape - tall rounded rectangle */}
      <rect
        x="-12"
        y="-22"
        width="24"
        height="44"
        rx="6"
        ry="6"
        fill={color}
        opacity="0.18"
        stroke={color}
        strokeWidth="1.5"
      />
      {/* Inner heat indicator - solid block whose height represents heat */}
      <rect
        x="-9"
        y="-19"
        width="18"
        height="38"
        rx="3"
        fill={color}
        opacity={Math.min(0.7, Math.max(0.15, (tempF - 100) / 200))}
      />
      <text
        x="0"
        y="-30"
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
        y="38"
        textAnchor="middle"
        fill={color}
        fontSize="11"
        fontFamily="Geist Mono, monospace"
        fontWeight="500"
      >
        {tempF.toFixed(0)}°F
      </text>
    </g>
  );
}

function Legend({ x, y, width }: { x: number; y: number; width: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <defs>
        <linearGradient id="tireGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#00d4ff" />
          <stop offset="50%" stopColor="#a3ff12" />
          <stop offset="100%" stopColor="#ff3c1c" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width={width} height="4" rx="2" fill="url(#tireGrad)" opacity="0.6" />
      <text x="0" y="14" fill="#5a5b62" fontSize="8" fontFamily="Geist Mono, monospace">
        130°F
      </text>
      <text
        x={width / 2}
        y="14"
        textAnchor="middle"
        fill="#5a5b62"
        fontSize="8"
        fontFamily="Geist Mono, monospace"
      >
        OPTIMAL
      </text>
      <text
        x={width}
        y="14"
        textAnchor="end"
        fill="#5a5b62"
        fontSize="8"
        fontFamily="Geist Mono, monospace"
      >
        270°F
      </text>
    </g>
  );
}
