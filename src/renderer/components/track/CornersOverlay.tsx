import { useMemo } from 'react';
import { Line, Html } from '@react-three/drei';
import type { TrackFrame } from '@shared/track';
import { detectTrackCorners, type DetectedCorner } from '@shared/analysis/trackCorners';

/**
 * Overlays detected corner phases on the 3D path:
 *   - mid-corner : green thick segments (high-curvature zone around apex)
 *   - corner exit : yellow thick segments (post-apex throttle zone)
 *
 * A numbered label floats above each corner's apex position.
 */

export const CORNER_COLORS = {
  mid:  '#22C55E', // green
  exit: '#EAB308', // yellow
} as const;

const LINE_WIDTH = 5;
const Y_OFFSET = 0.7; // above the path line

function buildPhaseSegments(
  frames: TrackFrame[],
  corners: DetectedCorner[],
  phase: 'mid' | 'exit',
): [number, number, number][] {
  const pts: [number, number, number][] = [];
  for (const corner of corners) {
    const idxs = corner.phases
      .filter((p) => p.phase === phase)
      .map((p) => p.frameIdx)
      .sort((a, b) => a - b);

    for (let i = 1; i < idxs.length; i++) {
      // Only connect adjacent (or near-adjacent) frames to avoid stray segments.
      if (idxs[i] - idxs[i - 1] <= 2) {
        const prev = frames[idxs[i - 1]];
        const curr = frames[idxs[i]];
        if (prev && curr) {
          pts.push(
            [prev.x, prev.y + Y_OFFSET, prev.z],
            [curr.x, curr.y + Y_OFFSET, curr.z],
          );
        }
      }
    }
  }
  return pts;
}

export function CornersOverlay({ frames }: { frames: TrackFrame[] }) {
  const corners = useMemo(() => detectTrackCorners(frames), [frames]);
  const midPts  = useMemo(() => buildPhaseSegments(frames, corners, 'mid'),  [frames, corners]);
  const exitPts = useMemo(() => buildPhaseSegments(frames, corners, 'exit'), [frames, corners]);

  return (
    <>
      {midPts.length >= 2 && (
        <Line points={midPts} segments lineWidth={LINE_WIDTH} color={CORNER_COLORS.mid} />
      )}
      {exitPts.length >= 2 && (
        <Line points={exitPts} segments lineWidth={LINE_WIDTH} color={CORNER_COLORS.exit} />
      )}
      {corners.map((corner) => (
        <Html
          key={corner.id}
          position={[corner.apexX, corner.apexY + 4, corner.apexZ]}
          center
          style={{ pointerEvents: 'none' }}
        >
          <div
            style={{
              color: '#ffffff',
              fontSize: '11px',
              fontFamily: 'monospace',
              fontWeight: 700,
              lineHeight: 1,
              padding: '2px 5px',
              background: 'rgba(0,0,0,0.65)',
              borderRadius: '3px',
              whiteSpace: 'nowrap',
              userSelect: 'none',
            }}
          >
            {corner.id + 1}
          </div>
        </Html>
      ))}
    </>
  );
}
