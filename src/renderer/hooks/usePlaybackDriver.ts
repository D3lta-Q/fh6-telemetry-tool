import { useEffect, useRef } from 'react';
import { usePlaybackStore } from '../store/playbackStore';
import { useTelemetryStore } from '../store/telemetryStore';

/**
 * When a session is playing, this hook advances the playback index using
 * wall-clock time and replays packets into the telemetry store so the
 * Dashboard widgets animate as if receiving live data.
 *
 * When playback is active, it also suppresses pushing data to `latest`
 * since the playback driver owns that during replay.
 */
export function usePlaybackDriver(): void {
  const session = usePlaybackStore((s) => s.session);
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const packetIndex = usePlaybackStore((s) => s.packetIndex);
  const setPlaying = usePlaybackStore((s) => s.setPlaying);
  const seekToTime = usePlaybackStore((s) => s.seekToTime);

  const pushPacket = useTelemetryStore((s) => s.pushPacket);
  const reset = useTelemetryStore((s) => s.reset);

  const prevIndexRef = useRef(0);

  // When session changes or loads, reset telemetry buffers
  useEffect(() => {
    if (session) {
      reset();
      prevIndexRef.current = 0;
    }
  }, [session, reset]);

  // When scrubbing (index changes while not playing), seed ring buffers
  // with a window of recent packets so charts show context.
  useEffect(() => {
    if (!session || isPlaying) return;
    if (session.packets.length === 0) return;

    const pkt = session.packets[packetIndex];
    if (!pkt) return;

    // Push a window of recent packets (last 5 seconds worth)
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
  }, [packetIndex, session, isPlaying, pushPacket, reset]);

  // Real-time playback animation loop
  useEffect(() => {
    if (!isPlaying || !session || session.packets.length === 0) return;

    const packets = session.packets;
    const startWall = performance.now();
    const startT = packets[packetIndex]?.receivedAt ?? session.startedAt;
    const startIdx = packetIndex;
    prevIndexRef.current = packetIndex;

    let rafId: number;
    const tick = () => {
      const elapsed = performance.now() - startWall;
      const targetT = startT + elapsed;

      // Binary search for the packet closest to targetT
      let lo = startIdx;
      let hi = packets.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if ((packets[mid]?.receivedAt ?? Infinity) <= targetT) lo = mid;
        else hi = mid - 1;
      }

      // Push all packets between prevIndex and current
      const prev = prevIndexRef.current;
      for (let i = prev + 1; i <= lo; i++) {
        const p = packets[i];
        if (p) pushPacket(p);
      }
      prevIndexRef.current = lo;

      if (lo >= packets.length - 1) {
        seekToTime(session.endedAt - session.startedAt);
        setPlaying(false);
        return;
      }

      // Update store index (this also updates frameIndex)
      const store = usePlaybackStore.getState();
      if (store.packetIndex !== lo) {
        usePlaybackStore.setState({ packetIndex: lo });
        // Sync frame index
        if (session.frames.length > 0) {
          const pktT = packets[lo]!.receivedAt;
          let flo = 0;
          let fhi = session.frames.length - 1;
          while (flo < fhi) {
            const mid = (flo + fhi + 1) >> 1;
            if ((session.frames[mid]?.t ?? Infinity) <= pktT) flo = mid;
            else fhi = mid - 1;
          }
          usePlaybackStore.setState({ frameIndex: flo });
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, session]); // eslint-disable-line react-hooks/exhaustive-deps
}
