import { useEffect } from 'react';
import { useTelemetryStore } from '../store/telemetryStore';

/**
 * Wire the preload IPC events into the Zustand stores. Call once at app root.
 *
 * Note: we don't useState the packet stream - that would re-render React 60+
 * times a second. Instead the store updates and components that care about
 * the firehose subscribe to `frame` (a simple counter) or read from ring
 * buffers on their own animation frame loop.
 */
export function useTelemetryBridge(): void {
  const pushPacket = useTelemetryStore((s) => s.pushPacket);
  const setStatus = useTelemetryStore((s) => s.setStatus);

  useEffect(() => {
    let cancelled = false;
    void window.forza.getListenerStatus().then((status) => {
      if (!cancelled && status) setStatus(status);
    });

    const offPacket = window.forza.onTelemetry((data) => pushPacket(data));
    const offStatus = window.forza.onListenerStatus((status) => setStatus(status));

    return () => {
      cancelled = true;
      offPacket();
      offStatus();
    };
  }, [pushPacket, setStatus]);
}
