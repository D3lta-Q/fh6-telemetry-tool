import { useEffect } from 'react';
import { useTelemetryStore } from '../store/telemetryStore';
import { useRecordingStore } from '../store/recordingStore';
import { useTrackStore } from '../store/trackStore';
import { usePlaybackStore } from '../store/playbackStore';

/**
 * Wire the preload IPC events into the Zustand stores. Call once at app root.
 *
 * When a playback session is loaded, live packet data is suppressed from the
 * Dashboard ring buffers (but still feeds the Track store's live frame for
 * the car model in live view).
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
      // Always feed track store (for live car position)
      pushTrack(data);

      // Only feed telemetry ring buffers when NOT in playback mode
      const playback = usePlaybackStore.getState().session;
      if (!playback) {
        pushPacket(data);
      }
    });
    const offStatus = window.forza.onListenerStatus((status) => setStatus(status));
    const offRecording = window.forza.onRecordingStatus((status) => {
      setRecording(status.isRecording, status.startedAt);
      // Recording always drives 3D tracking: start recording → start tracking,
      // stop recording → stop tracking.
      const trackStore = useTrackStore.getState();
      if (status.isRecording) {
        trackStore.startTracking(trackStore.mode);
      } else {
        trackStore.stopTracking();
      }
    });

    return () => {
      cancelled = true;
      offPacket();
      offStatus();
      offRecording();
    };
  }, [pushPacket, setStatus, setRecording, pushTrack]);
}
