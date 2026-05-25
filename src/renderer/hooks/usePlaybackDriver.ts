import { useEffect, useRef } from 'react';
import { usePlaybackStore } from '../store/playbackStore';
import { useTelemetryStore } from '../store/telemetryStore';

/**
 * Drives playback by replaying packets into the telemetry store so the
 * Dashboard widgets animate as if receiving live data.
 *
 * Two modes:
 * 1. Playing: an rAF loop advances the index by wall-clock time and
 *    pushes packets incrementally into ring buffers.
 * 2. Scrubbing (paused): when packetIndex changes, seed a 5s window of
 *    historical packets into the buffers for chart context.
 */
export function usePlaybackDriver(): void {
  const session = usePlaybackStore((s) => s.session);
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const setPlaying = usePlaybackStore((s) => s.setPlaying);

  const pushPacket = useTelemetryStore((s) => s.pushPacket);
  const reset = useTelemetryStore((s) => s.reset);

  const prevIndexRef = useRef(0);

  // Reset buffers when session loads or unloads
  useEffect(() => {
    reset();
    prevIndexRef.current = 0;
  }, [session, reset]);

  // Scrub handler: when NOT playing, watch for packetIndex changes and
  // seed the ring buffers with context.
  useEffect(() => {
    if (!session || isPlaying) return;
    if (session.packets.length === 0) return;

    const seedBuffers = (packetIndex: number) => {
      const pkt = session.packets[packetIndex];
      if (!pkt) return;

      const windowMs = 5000;
      const minTime = pkt.receivedAt - windowMs;
      reset();

      let start = packetIndex;
      while (start > 0 && (session.packets[start - 1]?.receivedAt ?? 0) >= minTime) {
        start--;
      }

      for (let i = start; i <= packetIndex; i++) {
        const p = session.packets[i];
        if (p) pushPacket(p);
      }

      prevIndexRef.current = packetIndex;
    };

    // Initial seed
    seedBuffers(usePlaybackStore.getState().packetIndex);

    // Watch for changes
    let prevPi = usePlaybackStore.getState().packetIndex;
    const unsub = usePlaybackStore.subscribe((state) => {
      if (state.packetIndex !== prevPi) {
        prevPi = state.packetIndex;
        seedBuffers(state.packetIndex);
      }
    });

    return unsub;
  }, [session, isPlaying, pushPacket, reset]);

  // Real-time playback animation loop
  useEffect(() => {
    if (!isPlaying || !session || session.packets.length === 0) return;

    const packets = session.packets;
    const startIdx = usePlaybackStore.getState().packetIndex;
    const startWall = performance.now();
    const startT = packets[startIdx]?.receivedAt ?? session.startedAt;
    prevIndexRef.current = startIdx;

    let rafId: number;
    const tick = () => {
      const elapsed = performance.now() - startWall;
      const targetT = startT + elapsed;

      let lo = startIdx;
      let hi = packets.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if ((packets[mid]?.receivedAt ?? Infinity) <= targetT) lo = mid;
        else hi = mid - 1;
      }

      // Push packets incrementally
      const prev = prevIndexRef.current;
      for (let i = prev + 1; i <= lo; i++) {
        const p = packets[i];
        if (p) pushPacket(p);
      }
      prevIndexRef.current = lo;

      if (lo >= packets.length - 1) {
        usePlaybackStore.setState({
          packetIndex: packets.length - 1,
          frameIndex: session.frames.length > 0 ? session.frames.length - 1 : 0,
        });
        setPlaying(false);
        return;
      }

      // Sync store
      const pktT = packets[lo]!.receivedAt;
      let fIdx = 0;
      if (session.frames.length > 0) {
        let flo = 0;
        let fhi = session.frames.length - 1;
        while (flo < fhi) {
          const mid = (flo + fhi + 1) >> 1;
          if ((session.frames[mid]?.t ?? Infinity) <= pktT) flo = mid;
          else fhi = mid - 1;
        }
        fIdx = flo;
      }
      usePlaybackStore.setState({ packetIndex: lo, frameIndex: fIdx });

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, session, pushPacket, setPlaying]);
}
