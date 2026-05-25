import { useState } from 'react';
import { useTrackStore } from '../store/trackStore';
import { usePlaybackStore } from '../store/playbackStore';
import { TrackViewer } from './track/TrackViewer';
import { TrackControls } from './track/TrackControls';
import type { TrackMode, PathColorMetric } from '@shared/track';

/**
 * The "Track" tab — full 3D path visualisation for the vehicle session.
 *
 * Recording is now handled by the unified Recorder in the main process.
 * Starting/stopping track recording just toggles the global record state.
 */
export function TrackTab() {
  const isTracking = useTrackStore((s) => s.isTracking);
  const startTracking = useTrackStore((s) => s.startTracking);
  const stopTracking = useTrackStore((s) => s.stopTracking);
  const colorMetric = useTrackStore((s) => s.colorMetric);
  const setColorMetric = useTrackStore((s) => s.setColorMetric);
  const loadSession = usePlaybackStore((s) => s.loadSession);

  const [mode, setMode] = useState<TrackMode>('free');

  const handleStart = () => {
    startTracking(mode);
    void window.forza.startRecording(mode);
  };

  const handleStop = async () => {
    stopTracking();
    await window.forza.stopRecording();
  };

  const handleOpen = async () => {
    const session = await window.forza.openTrackSession();
    if (session) loadSession(session);
  };

  const handleClosePlayback = () => {
    usePlaybackStore.getState().closeSession();
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <TrackControls
        mode={mode}
        isTracking={isTracking}
        metric={colorMetric}
        onSetMode={setMode}
        onSetMetric={setColorMetric}
        onStart={handleStart}
        onStop={() => void handleStop()}
        onOpen={() => void handleOpen()}
        onClosePlayback={handleClosePlayback}
      />
      <TrackViewer mode={mode} isTracking={isTracking} metric={colorMetric} />
    </div>
  );
}
