/**
 * Lightweight corner detection that works directly from TrackFrame data
 * (position, yaw, speed, throttle, brake, timestamps).
 *
 * Uses yaw-rate / speed as a proxy for curvature — no full telemetry packets
 * needed — so it works for both live recordings and saved sessions.
 */

import type { TrackFrame } from '../track';

const CURV_THRESHOLD = 0.015; // rad/m — corners tighter than ~67 m radius
const CURV_SMOOTH = 3;        // ± frame moving-average window
const MIN_CORNER_FRAMES = 10;
const CORNER_GAP_BRIDGE = 8;
const MID_CURV_FRAC = 0.6;    // fraction of peak curvature that is "mid"
const APEX_FALLBACK_WIN = 5;  // ± frames around speed-apex when geometry is flat

export interface TrackCornerFrame {
  frameIdx: number;
  phase: 'mid' | 'exit';
}

export interface DetectedCorner {
  id: number;
  apexX: number;
  apexY: number;
  apexZ: number;
  phases: TrackCornerFrame[];
}

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

function computeCurvatures(frames: TrackFrame[]): Float64Array {
  const N = frames.length;
  const raw = new Float64Array(N);

  for (let i = 1; i < N - 1; i++) {
    const dt = (frames[i + 1].t - frames[i - 1].t) / 1000;
    const spd = frames[i].speed;
    if (dt <= 0 || spd < 0.5) continue;
    raw[i] = wrapAngle(frames[i + 1].yaw - frames[i - 1].yaw) / dt / spd;
  }

  const smooth = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    let sum = 0, cnt = 0;
    const lo = Math.max(0, i - CURV_SMOOTH);
    const hi = Math.min(N - 1, i + CURV_SMOOTH);
    for (let j = lo; j <= hi; j++) { sum += raw[j]; cnt++; }
    smooth[i] = cnt > 0 ? sum / cnt : 0;
  }

  return smooth;
}

function buildCorner(
  frames: TrackFrame[],
  curv: Float64Array,
  start: number,
  end: number,
  id: number,
): DetectedCorner {
  // Apex = max |curvature|; fall back to min speed for flat geometry.
  let apexIdx = start;
  let peakK = 0;
  for (let k = start; k <= end; k++) {
    const ak = Math.abs(curv[k]);
    if (ak > peakK) { peakK = ak; apexIdx = k; }
  }
  const geometric = peakK > 1 / 1000;
  if (!geometric) {
    let minSpd = Infinity;
    for (let k = start; k <= end; k++) {
      if (frames[k].speed < minSpd) { minSpd = frames[k].speed; apexIdx = k; }
    }
  }

  const midK = peakK * MID_CURV_FRAC;
  const phases: TrackCornerFrame[] = [];

  for (let k = start; k <= end; k++) {
    const f = frames[k];
    let phase: 'mid' | 'exit' | null = null;

    if (geometric) {
      if (Math.abs(curv[k]) >= midK) {
        phase = 'mid';
      } else if (k > apexIdx) {
        phase = 'exit';
      }
    } else {
      if (Math.abs(k - apexIdx) <= APEX_FALLBACK_WIN) {
        phase = 'mid';
      } else if (k > apexIdx && f.throttle > 0.15) {
        phase = 'exit';
      }
    }

    if (phase) phases.push({ frameIdx: k, phase });
  }

  const af = frames[apexIdx];
  return { id, apexX: af.x, apexY: af.y, apexZ: af.z, phases };
}

export function detectTrackCorners(frames: TrackFrame[]): DetectedCorner[] {
  if (frames.length < MIN_CORNER_FRAMES * 2) return [];

  const curv = computeCurvatures(frames);
  const N = frames.length;
  const corners: DetectedCorner[] = [];
  let i = 0;
  let id = 0;

  while (i < N) {
    if (Math.abs(curv[i]) <= CURV_THRESHOLD) { i++; continue; }

    let end = i;
    let gap = 0;
    for (let j = i + 1; j < N; j++) {
      if (Math.abs(curv[j]) > CURV_THRESHOLD) { end = j; gap = 0; }
      else if (++gap > CORNER_GAP_BRIDGE) break;
    }

    if (end - i + 1 >= MIN_CORNER_FRAMES) {
      corners.push(buildCorner(frames, curv, i, end, id++));
    }
    i = end + 1;
  }

  return corners;
}
