import { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { Line } from '@react-three/drei';
import type { TrackFrame } from '@shared/track';

/**
 * Overlays validation flags on the 3D path as thick coloured line segments:
 *   - off-road   : brown — car on a loose/rough surface
 *   - airborne   : light blue — all wheels drooped (jump)
 *   - handbrake  : light purple — lever engaged
 *   - collision  : red — hard impact impulse (rendered as large point markers)
 */

export const VALIDATION_COLORS = {
  offRoad:   '#8B4513',  // brown
  airborne:  '#87CEEB',  // light blue
  handbrake: '#C084FC',  // light purple
  collision: '#ff3c1c',  // red
} as const;

const LINE_WIDTH = 5;

type FlagKey = 'offRoad' | 'airborne' | 'handbrake';

/** Returns [start, end, start, end, ...] point pairs for thick LineSegments. */
function buildSegmentPts(
  frames: TrackFrame[],
  field: FlagKey,
  yOff: number,
): [number, number, number][] {
  const pts: [number, number, number][] = [];
  for (let i = 1; i < frames.length; i++) {
    const p = frames[i - 1];
    const c = frames[i];
    if (p[field] && c[field]) {
      pts.push([p.x, p.y + yOff, p.z], [c.x, c.y + yOff, c.z]);
    }
  }
  return pts;
}

interface Props {
  frames: TrackFrame[];
}

export function ValidationOverlay({ frames }: Props) {
  const offRoadPts   = useMemo(() => buildSegmentPts(frames, 'offRoad',   0.30), [frames]);
  const airbornePts  = useMemo(() => buildSegmentPts(frames, 'airborne',  0.45), [frames]);
  const handbrakePts = useMemo(() => buildSegmentPts(frames, 'handbrake', 0.20), [frames]);

  // Collision geometry — imperative so we can update a fixed object efficiently.
  const collisionGeo = useMemo(() => new THREE.BufferGeometry(), []);
  const collisionMat = useMemo(
    () => new THREE.PointsMaterial({ color: VALIDATION_COLORS.collision, size: 10, sizeAttenuation: false }),
    [],
  );
  const collisionPts = useMemo(() => {
    const p = new THREE.Points(collisionGeo, collisionMat);
    p.frustumCulled = false;
    return p;
  }, [collisionGeo, collisionMat]);

  useEffect(() => {
    const positions: number[] = [];
    for (const f of frames) {
      if (f.collision) positions.push(f.x, f.y + 0.6, f.z);
    }
    collisionGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(positions), 3),
    );
  }, [frames, collisionGeo]);

  useEffect(
    () => () => { collisionGeo.dispose(); collisionMat.dispose(); },
    [collisionGeo, collisionMat],
  );

  return (
    <>
      {offRoadPts.length >= 2 && (
        <Line points={offRoadPts} segments lineWidth={LINE_WIDTH} color={VALIDATION_COLORS.offRoad} />
      )}
      {airbornePts.length >= 2 && (
        <Line points={airbornePts} segments lineWidth={LINE_WIDTH} color={VALIDATION_COLORS.airborne} />
      )}
      {handbrakePts.length >= 2 && (
        <Line points={handbrakePts} segments lineWidth={LINE_WIDTH} color={VALIDATION_COLORS.handbrake} />
      )}
      <primitive object={collisionPts} />
    </>
  );
}
