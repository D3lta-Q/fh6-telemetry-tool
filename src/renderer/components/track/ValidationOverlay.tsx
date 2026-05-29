import { useRef, useMemo, useEffect, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { TrackFrame } from '@shared/track';

/**
 * Overlays the analyser's validation flags on the 3D path:
 *   - off-road : orange line segments where the car is on a loose surface
 *   - airborne : purple line segments where all wheels are drooped (jumps)
 *   - collision: red points at hard-impact frames
 *
 * These read the denormalised `offRoad` / `airborne` / `collision` booleans on
 * each TrackFrame (populated at record time), so the overlay works for live
 * recordings and saved sessions alike. Mounting/unmounting (driven by the
 * Track tab toggle) naturally rebuilds the geometry from scratch.
 */

const MAX_POINTS = 200_000;

export const VALIDATION_COLORS = {
  offRoad: '#ff8c00',
  airborne: '#b14dff',
  collision: '#ff3c1c',
} as const;

interface Props {
  frames: TrackFrame[];
  /** Playback re-scans every render (frames array is sliced as time advances). */
  rebuildEveryFrame?: boolean;
}

export function ValidationOverlay({ frames, rebuildEveryFrame = false }: Props) {
  const offRoadGeo = useMemo(() => makeLineGeo(), []);
  const airborneGeo = useMemo(() => makeLineGeo(), []);
  const collisionGeo = useMemo(() => makePointGeo(), []);

  const offRoadMat = useMemo(() => new THREE.LineBasicMaterial({ color: VALIDATION_COLORS.offRoad }), []);
  const airborneMat = useMemo(() => new THREE.LineBasicMaterial({ color: VALIDATION_COLORS.airborne }), []);
  const collisionMat = useMemo(
    () => new THREE.PointsMaterial({ color: VALIDATION_COLORS.collision, size: 6, sizeAttenuation: false }),
    []
  );

  const offRoadLine = useMemo(() => lineSegments(offRoadGeo, offRoadMat), [offRoadGeo, offRoadMat]);
  const airborneLine = useMemo(() => lineSegments(airborneGeo, airborneMat), [airborneGeo, airborneMat]);
  const collisionPoints = useMemo(() => {
    const p = new THREE.Points(collisionGeo, collisionMat);
    p.frustumCulled = false;
    return p;
  }, [collisionGeo, collisionMat]);

  const offRoadBuilt = useRef(0);
  const airborneBuilt = useRef(0);
  const collisionBuilt = useRef(0);

  // Reset when frames are cleared (new recording).
  useEffect(() => {
    if (frames.length < offRoadBuilt.current) {
      offRoadBuilt.current = 0;
      airborneBuilt.current = 0;
      collisionBuilt.current = 0;
      offRoadGeo.setDrawRange(0, 0);
      airborneGeo.setDrawRange(0, 0);
      collisionGeo.setDrawRange(0, 0);
    }
  }, [frames.length, offRoadGeo, airborneGeo, collisionGeo]);

  useFrame(() => {
    updateLineOverlay(offRoadGeo, offRoadBuilt, frames, 'offRoad', rebuildEveryFrame);
    updateLineOverlay(airborneGeo, airborneBuilt, frames, 'airborne', rebuildEveryFrame);
    updatePointOverlay(collisionGeo, collisionBuilt, frames, rebuildEveryFrame);
  });

  useEffect(
    () => () => {
      offRoadGeo.dispose();
      airborneGeo.dispose();
      collisionGeo.dispose();
      offRoadMat.dispose();
      airborneMat.dispose();
      collisionMat.dispose();
    },
    [offRoadGeo, airborneGeo, collisionGeo, offRoadMat, airborneMat, collisionMat]
  );

  return (
    <>
      <primitive object={offRoadLine} />
      <primitive object={airborneLine} />
      <primitive object={collisionPoints} />
    </>
  );
}

// ---- helpers -----------------------------------------------------------------

function makeLineGeo(): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_POINTS * 3), 3));
  geo.setDrawRange(0, 0);
  return geo;
}

function makePointGeo(): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_POINTS * 3), 3));
  geo.setDrawRange(0, 0);
  return geo;
}

function lineSegments(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.LineSegments {
  const l = new THREE.LineSegments(geo, mat);
  l.frustumCulled = false;
  return l;
}

/** Draw connected segments wherever a boolean flag is active on consecutive frames. */
function updateLineOverlay(
  geo: THREE.BufferGeometry,
  builtRef: MutableRefObject<number>,
  frames: TrackFrame[],
  field: 'offRoad' | 'airborne',
  rebuildEveryFrame: boolean
): void {
  const target = frames.length;
  if (!rebuildEveryFrame && builtRef.current >= target) return;

  const posAttr = geo.attributes['position'] as THREE.BufferAttribute;
  const arr = posAttr.array as Float32Array;

  const scanStart = rebuildEveryFrame ? 0 : builtRef.current;
  let segCount = rebuildEveryFrame ? 0 : geo.drawRange.count / 2;
  let prevActive = false;
  let prevX = 0;
  let prevY = 0;
  let prevZ = 0;

  for (let i = scanStart; i < Math.min(target, MAX_POINTS / 2); i++) {
    const f = frames[i];
    const active = !!f[field];
    if (active && prevActive) {
      const base = segCount * 6;
      arr[base] = prevX;
      arr[base + 1] = prevY + 0.3;
      arr[base + 2] = prevZ;
      arr[base + 3] = f.x;
      arr[base + 4] = f.y + 0.3;
      arr[base + 5] = f.z;
      segCount++;
    }
    prevActive = active;
    prevX = f.x;
    prevY = f.y;
    prevZ = f.z;
  }

  posAttr.needsUpdate = true;
  geo.setDrawRange(0, segCount * 2);
  builtRef.current = target;
}

/** Draw a point at each collision-flagged frame. */
function updatePointOverlay(
  geo: THREE.BufferGeometry,
  builtRef: MutableRefObject<number>,
  frames: TrackFrame[],
  rebuildEveryFrame: boolean
): void {
  const target = frames.length;
  if (!rebuildEveryFrame && builtRef.current >= target) return;

  const posAttr = geo.attributes['position'] as THREE.BufferAttribute;
  const arr = posAttr.array as Float32Array;

  let count = rebuildEveryFrame ? 0 : geo.drawRange.count;
  const scanStart = rebuildEveryFrame ? 0 : builtRef.current;

  for (let i = scanStart; i < Math.min(target, MAX_POINTS); i++) {
    const f = frames[i];
    if (f.collision) {
      const base = count * 3;
      arr[base] = f.x;
      arr[base + 1] = f.y + 0.5;
      arr[base + 2] = f.z;
      count++;
    }
  }

  posAttr.needsUpdate = true;
  geo.setDrawRange(0, count);
  builtRef.current = target;
}
