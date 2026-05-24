import { useTelemetryStore } from '../../store/telemetryStore';
import { useAnimationTick } from '../../hooks/useAnimationTick';

/**
 * A top-down + side-view hybrid of the car showing live suspension travel.
 *
 * Each corner is a vertical "strut" with:
 *  - A car body silhouette anchor at the top
 *  - A wheel/contact patch at the bottom
 *  - The strut length changes with compression (1.0 = fully compressed,
 *    so we draw it shortest at 1.0 and longest at 0.0)
 *
 * The accent color saturates as compression increases - subtle but readable
 * peripherally, which is what you want for a side-eye glance while driving.
 */
export function SuspensionVisual() {
  // useAnimationTick keeps this updating without React state churn.
  useAnimationTick();
  const latest = useTelemetryStore.getState().latest;

  const fl = latest?.normalizedSuspensionTravelFrontLeft ?? 0.5;
  const fr = latest?.normalizedSuspensionTravelFrontRight ?? 0.5;
  const rl = latest?.normalizedSuspensionTravelRearLeft ?? 0.5;
  const rr = latest?.normalizedSuspensionTravelRearRight ?? 0.5;

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
        <text
          x="160"
          y="200"
          textAnchor="middle"
          fill="#3a3b42"
          fontSize="8"
          fontFamily="Geist Mono, monospace"
          letterSpacing="0.3em"
        >
          REAR
        </text>

        <Strut x={50} y={50} label="FL" travel={fl} />
        <Strut x={270} y={50} label="FR" travel={fr} />
        <Strut x={50} y={150} label="RL" travel={rl} />
        <Strut x={270} y={150} label="RR" travel={rr} />
      </svg>
    </div>
  );
}

/**
 * A single strut indicator. `travel` is 0..1 where 1 = fully compressed.
 *
 * Drawn as a vertical bar with a wheel disk: the bar shortens as compression
 * increases (giving the wheel an upward push toward the chassis).
 */
function Strut({ x, y, label, travel }: { x: number; y: number; label: string; travel: number }) {
  const t = Math.max(0, Math.min(1, travel));
  // Map 0..1 travel -> bar length (longest when extended, shortest when compressed)
  const maxLen = 26;
  const minLen = 6;
  const len = maxLen - (maxLen - minLen) * t;

  // Color: pale gray at neutral, intensifying to red as it compresses past midpoint
  const compressionColor =
    t < 0.5
      ? '#5a5b62' // extended / neutral
      : t < 0.75
        ? '#ffd60a' // moderate compression
        : '#ff3c1c'; // heavy compression

  const wheelR = 9;

  return (
    <g transform={`translate(${x}, ${y})`}>
      {/* Travel guide rail (faint) */}
      <line x1="0" y1="-30" x2="0" y2="30" stroke="#1d1e23" strokeWidth="1" />
      {/* Spring/strut visualization - drawn as a zigzag */}
      <Spring x={0} y={-len / 2} length={len} color={compressionColor} />
      {/* Wheel */}
      <circle
        cx="0"
        cy={len / 2 + wheelR}
        r={wheelR}
        fill="#0f1014"
        stroke={compressionColor}
        strokeWidth="1.5"
      />
      <circle cx="0" cy={len / 2 + wheelR} r="3" fill={compressionColor} opacity="0.6" />

      {/* Label */}
      <text
        x="0"
        y="-38"
        textAnchor="middle"
        fill="#8b8c93"
        fontSize="9"
        fontFamily="Geist Mono, monospace"
        letterSpacing="0.15em"
      >
        {label}
      </text>
      {/* Travel percentage */}
      <text
        x="0"
        y={len / 2 + wheelR + 18}
        textAnchor="middle"
        fill={compressionColor}
        fontSize="9"
        fontFamily="Geist Mono, monospace"
      >
        {(t * 100).toFixed(0)}%
      </text>
    </g>
  );
}

function Spring({ x, y, length, color }: { x: number; y: number; length: number; color: string }) {
  // Draw the spring as a zig-zag line. Number of coils stays the same but
  // gets visually compressed as length shrinks.
  const coils = 4;
  const halfLen = length / 2;
  const step = length / (coils * 2);
  let path = `M ${x - 4} ${y}`;
  for (let i = 0; i < coils * 2; i++) {
    const side = i % 2 === 0 ? 4 : -4;
    path += ` L ${x + side} ${y + step * (i + 1)}`;
  }
  return (
    <>
      <line x1={x} y1={y - 4} x2={x} y2={y - 12} stroke={color} strokeWidth="1.5" />
      <line x1={x} y1={y + halfLen * 2 + 4} x2={x} y2={y + halfLen * 2 + 12} stroke={color} strokeWidth="1.5" />
      <path d={path} fill="none" stroke={color} strokeWidth="1.25" strokeLinejoin="round" />
    </>
  );
}
