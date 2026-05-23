import { useEffect, useRef, useState } from 'react';

/**
 * Returns a counter that increments at requestAnimationFrame cadence (capped
 * by the display refresh rate). Use it as a "the world might have changed"
 * trigger for chart components without forcing a re-render per UDP packet.
 *
 * The point: telemetry can arrive at 240 Hz, but a 60/120/144 Hz monitor will
 * only paint at its own rate. Re-rendering more often than that is waste.
 */
export function useAnimationTick(): number {
  const [tick, setTick] = useState(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loop = () => {
      if (cancelled) return;
      setTick((t) => (t + 1) | 0);
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => {
      cancelled = true;
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    };
  }, []);

  return tick;
}
