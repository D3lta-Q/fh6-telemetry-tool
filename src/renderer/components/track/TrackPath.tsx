import { useRef, useEffect, useMemo, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { TrackFrame, PathColorMetric } from '@shared/track';

const MAX_POINTS = 200_000;

function metricValue(f: TrackFrame, metric: PathColorMetric): number {
  switch (metric) {
    case 'speed':    return Math.min(f.speed / 80, 1);
    case 'grip':     return 1 - Math.min(f.grip / 1.5, 1);
    case 'throttle': return f.throttle;
    case 'brake':    return f.brake;
  }
}

/** Red (0) → Yellow (0.5) → Green (1) */
function metricColor(v: number, out: THREE.Color): void {
  if (v < 0.5) { out.setRGB(1, v * 2, 0); }
  else          { out.setRGB(1 - (v - 0.5) * 2, 1, 0); }
}

interface TrackPathProps {
  frames: TrackFrame[];
  metric: PathColorMetric;
  rebuildEveryFrame?: boolean;
}

export function TrackPath({ frames, metric, rebuildEveryFrame = false }: TrackPathProps) {
  // ---- Geometry + material setup (created once) ---------------------------------
  const mainGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_POINTS * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_POINTS * 3), 3));
    geo.setDrawRange(0, 0);
    return geo;
  }, []);
  const mainMat = useMemo(() => new THREE.LineBasicMaterial({ vertexColors: true }), []);
  const mainLine = useMemo(() => new THREE.Line(mainGeo, mainMat), [mainGeo, mainMat]);

  const rumbleGeo = useMemo(() => makeOverlayGeo(), []);
  const puddleGeo = useMemo(() => makeOverlayGeo(), []);
  const rumbleMat = useMemo(() => new THREE.LineBasicMaterial({ color: '#ffd60a' }), []);
  const puddleMat = useMemo(() => new THREE.LineBasicMaterial({ color: '#00d4ff' }), []);
  const rumbleLine = useMemo(() => new THREE.LineSegments(rumbleGeo, rumbleMat), [rumbleGeo, rumbleMat]);
  const puddleLine = useMemo(() => new THREE.LineSegments(puddleGeo, puddleMat), [puddleGeo, puddleMat]);

  // ---- Incremental-build refs ---------------------------------------------------
  const builtUpTo = useRef(0);
  const prevMetric = useRef(metric);
  const rumbleBuilt = useRef(0);
  const puddleBuilt = useRef(0);

  // Re-colour when the metric selector changes.
  useEffect(() => {
    if (prevMetric.current !== metric) {
      builtUpTo.current = 0;
      prevMetric.current = metric;
    }
  }, [metric]);

  // Reset all draw ranges when frames are cleared (new recording started).
  useEffect(() => {
    if (frames.length < builtUpTo.current) {
      builtUpTo.current = 0;
      mainGeo.setDrawRange(0, 0);
      rumbleBuilt.current = 0;
      rumbleGeo.setDrawRange(0, 0);
      puddleBuilt.current = 0;
      puddleGeo.setDrawRange(0, 0);
    }
  }, [frames.length, mainGeo, rumbleGeo, puddleGeo]);

  useEffect(() => {
    if (rebuildEveryFrame) {
      builtUpTo.current = 0;
      rumbleBuilt.current = 0;
      puddleBuilt.current = 0;
    }
  });

  // ---- Main path update ---------------------------------------------------------
  useFrame(() => {
    const target = frames.length;
    const begin = rebuildEveryFrame ? 0 : builtUpTo.current;
    if (begin >= target && !rebuildEveryFrame) return;

    const posAttr = mainGeo.attributes['position'] as THREE.BufferAttribute;
    const colAttr = mainGeo.attributes['color'] as THREE.BufferAttribute;
    const posArr = posAttr.array as Float32Array;
    const colArr = colAttr.array as Float32Array;
    const c = new THREE.Color();

    for (let i = begin; i < Math.min(target, MAX_POINTS); i++) {
      const f = frames[i];
      posArr[i * 3]     = f.x;
      posArr[i * 3 + 1] = f.y + 0.1;
      posArr[i * 3 + 2] = f.z;
      metricColor(metricValue(f, metric), c);
      colArr[i * 3]     = c.r;
      colArr[i * 3 + 1] = c.g;
      colArr[i * 3 + 2] = c.b;
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    mainGeo.setDrawRange(0, Math.min(target, MAX_POINTS));
    builtUpTo.current = target;
  });

  // ---- Overlay update -----------------------------------------------------------

  useFrame(() => {
    updateOverlay(rumbleGeo, rumbleBuilt, frames, frames.length, 'rumble', rebuildEveryFrame);
    updateOverlay(puddleGeo, puddleBuilt, frames, frames.length, 'puddle', rebuildEveryFrame);
  });

  useEffect(() => () => {
    mainGeo.dispose(); mainMat.dispose();
    rumbleGeo.dispose(); rumbleMat.dispose();
    puddleGeo.dispose(); puddleMat.dispose();
  }, [mainGeo, mainMat, rumbleGeo, rumbleMat, puddleGeo, puddleMat]);

  return (
    <>
      <primitive object={mainLine} />
      <primitive object={rumbleLine} />
      <primitive object={puddleLine} />
    </>
  );
}

// ---- helpers ------------------------------------------------------------------

function makeOverlayGeo(): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_POINTS * 3), 3));
  geo.setDrawRange(0, 0);
  return geo;
}

function updateOverlay(
  geo: THREE.BufferGeometry,
  builtRef: MutableRefObject<number>,
  frames: TrackFrame[],
  target: number,
  field: 'rumble' | 'puddle',
  rebuildEveryFrame: boolean,
): void {
  const begin = rebuildEveryFrame ? 0 : builtRef.current;
  if (begin >= target && !rebuildEveryFrame) return;

  const posAttr = geo.attributes['position'] as THREE.BufferAttribute;
  const arr = posAttr.array as Float32Array;

  let segCount = rebuildEveryFrame ? 0 : (geo.drawRange.count / 2);
  let prevActive = false, prevX = 0, prevY = 0, prevZ = 0;

  // When rebuilding, re-scan from start. Otherwise continue from last built.
  const scanStart = rebuildEveryFrame ? 0 : begin;
  if (rebuildEveryFrame) segCount = 0;

  for (let i = scanStart; i < Math.min(target, MAX_POINTS / 2); i++) {
    const f = frames[i];
    const active = f[field];
    if (active && prevActive) {
      const base = segCount * 6;
      arr[base]     = prevX; arr[base + 1] = prevY + 0.25; arr[base + 2] = prevZ;
      arr[base + 3] = f.x;   arr[base + 4] = f.y  + 0.25; arr[base + 5] = f.z;
      segCount++;
    }
    prevActive = active; prevX = f.x; prevY = f.y; prevZ = f.z;
  }

  posAttr.needsUpdate = true;
  geo.setDrawRange(0, segCount * 2);
  builtRef.current = target;
}
