import { useTelemetryStore } from '../../store/telemetryStore';
import { useAnimationTick } from '../../hooks/useAnimationTick';

/**
 * Four tire grip indicators.
 *
 * Forza reports `tireCombinedSlip` per corner, where 0 = full grip and any
 * value ≥1 means the tire is sliding. The visual maps that to:
 *   - color: lime (full grip) → yellow (some slip, ~0.5) → red (sliding, ≥1)
 *   - radial fill: a wedge that grows clockwise as slip increases. Empty wedge
 *     = full grip; full wedge = total loss of grip.
 *
 * Layout mirrors the other 4-corner visuals (suspension, temp) so the eye
 * scans them as a consistent set.
 */
export function TireGripVisual() {
  useAnimationTick();
  const latest = useTelemetryStore.getState().latest;

  const fl = latest?.tireCombinedSlipFrontLeft ?? 0;
  const fr = latest?.tireCombinedSlipFrontRight ?? 0;
  const rl = latest?.tireCombinedSlipRearLeft ?? 0;
  const rr = latest?.tireCombinedSlipRearRight ?? 0;

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

        <TireGrip x={50} y={50} label="FL" slip={fl} />
        <TireGrip x={270} y={50} label="FR" slip={fr} />
        <TireGrip x={50} y={150} label="RL" slip={rl} />
        <TireGrip x={270} y={150} label="RR" slip={rr} />

        <Legend x={60} y={195} width={200} />
      </svg>
    </div>
  );
}

/**
 * Map slip magnitude to a grip color. Below 0.3 is normal cornering load,
 * 0.3..0.8 is starting-to-lose-grip, ≥0.8 is fully sliding.
 */
function gripColor(slip: number): string {
  const s = Math.abs(slip);
  if (s < 0.3) return '#a3ff12'; // lime - full grip
  if (s < 0.8) return '#ffd60a'; // yellow - approaching limit
  return '#ff3c1c'; // red - sliding
}

/** Grip as a 0..1 value (1 = full grip, 0 = total loss). Used for the wedge. */
function gripFraction(slip: number): number {
  // Saturate at slip=1.5 to keep the visual responsive even during big slides.
  return Math.max(0, Math.min(1, 1 - Math.abs(slip) / 1.5));
}

function TireGrip({ x, y, label, slip }: { x: number; y: number; label: string; slip: number }) {
  const color = gripColor(slip);
  const grip = gripFraction(slip);
  const r = 18;

  // Draw the grip wedge as a circular arc filled clockwise from the top. When
  // grip == 1, the wedge is full (good). When grip == 0, no wedge (sliding).
  // We use a polar-coordinate sweep to compute the path endpoint.
  const sweepAngle = grip * Math.PI * 2; // radians
  const endX = Math.sin(sweepAngle) * r;
  const endY = -Math.cos(sweepAngle) * r;
  const largeArc = sweepAngle > Math.PI ? 1 : 0;

  // Build the SVG arc path: move to center, line to top, arc to endpoint,
  // close. The "M c L top A r,r 0 ... x,y Z" pattern.
  const arcPath =
    grip >= 0.999
      ? `M 0 0 m 0 -${r} a ${r} ${r} 0 1 1 0 ${r * 2} a ${r} ${r} 0 1 1 0 -${r * 2}`
      : grip <= 0.001
        ? ''
        : `M 0 0 L 0 -${r} A ${r} ${r} 0 ${largeArc} 1 ${endX.toFixed(2)} ${endY.toFixed(2)} Z`;

  return (
    <g transform={`translate(${x}, ${y})`}>
      {/* Outer ring - matches other 4-corner widgets visually */}
      <circle cx="0" cy="0" r={r + 3} fill="#0f1014" stroke="#26272d" strokeWidth="1" />
      {/* Faint full-circle baseline so empty grip still reads as a tire */}
      <circle cx="0" cy="0" r={r} fill="none" stroke="#26272d" strokeWidth="1" strokeDasharray="2 3" />
      {/* The grip wedge */}
      {arcPath && <path d={arcPath} fill={color} opacity="0.85" />}
      {/* Inner dot for visual anchor */}
      <circle cx="0" cy="0" r="2.5" fill="#0a0a0b" />

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
        fontSize="10"
        fontFamily="Geist Mono, monospace"
        fontWeight="500"
      >
        {(grip * 100).toFixed(0)}%
      </text>
    </g>
  );
}

function Legend({ x, y, width }: { x: number; y: number; width: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <defs>
        <linearGradient id="gripGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ff3c1c" />
          <stop offset="50%" stopColor="#ffd60a" />
          <stop offset="100%" stopColor="#a3ff12" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width={width} height="4" rx="2" fill="url(#gripGrad)" opacity="0.6" />
      <text x="0" y="14" fill="#5a5b62" fontSize="8" fontFamily="Geist Mono, monospace">
        SLIDING
      </text>
      <text
        x={width / 2}
        y="14"
        textAnchor="middle"
        fill="#5a5b62"
        fontSize="8"
        fontFamily="Geist Mono, monospace"
      >
        LIMIT
      </text>
      <text
        x={width}
        y="14"
        textAnchor="end"
        fill="#5a5b62"
        fontSize="8"
        fontFamily="Geist Mono, monospace"
      >
        GRIP
      </text>
    </g>
  );
}
