import { useEffect } from 'react';
import { useTelemetryStore } from '../store/telemetryStore';
import { useRecordingStore } from '../store/recordingStore';
import { useTrackStore } from '../store/trackStore';

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
  const setRecording = useRecordingStore((s) => s.setRecording);
  const pushTrack = useTrackStore((s) => s.pushTelemetry);

  useEffect(() => {
    let cancelled = false;
    void window.forza.getListenerStatus().then((status) => {
      if (!cancelled && status) setStatus(status);
    });

    const offPacket = window.forza.onTelemetry((data) => {
      pushPacket(data);
      pushTrack(data);
    });
    const offStatus = window.forza.onListenerStatus((status) => setStatus(status));
    const offRecording = window.forza.onRecordingStatus((status) => {
      setRecording(status.isRecording, status.startedAt);
    });

    return () => {
      cancelled = true;
      offPacket();
      offStatus();
      offRecording();
    };
  }, [pushPacket, setStatus, setRecording, pushTrack]);
}
