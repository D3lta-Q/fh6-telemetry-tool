import { useState } from 'react';
import { useTrackStore } from '../store/trackStore';
import { usePlaybackStore } from '../store/playbackStore';
import { TrackViewer } from './track/TrackViewer';
import { TrackControls } from './track/TrackControls';
import type { PathColorMetric } from '@shared/track';

/**
 * The "Track" tab — full 3D path visualisation for the vehicle session.
 *
 * The Tracking toggle only controls live path rendering (no recording).
 * The TopBar Record button auto-enables tracking AND records telemetry.
 */
export function TrackTab() {
  const isTracking = useTrackStore((s) => s.isTracking);
  const startTracking = useTrackStore((s) => s.startTracking);
  const stopTracking = useTrackStore((s) => s.stopTracking);
  const clearPath = useTrackStore((s) => s.clearPath);
  const mode = useTrackStore((s) => s.mode);
  const setMode = useTrackStore((s) => s.setMode);
  const colorMetric = useTrackStore((s) => s.colorMetric);
  const setColorMetric = useTrackStore((s) => s.setColorMetric);
  const loadSession = usePlaybackStore((s) => s.loadSession);

  const [showValidation, setShowValidation] = useState(false);

  const handleStart = () => startTracking(mode);
  const handleStop = () => stopTracking();

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
        showValidation={showValidation}
        onSetMode={setMode}
        onSetMetric={setColorMetric}
        onToggleValidation={() => setShowValidation((v) => !v)}
        onStart={handleStart}
        onStop={handleStop}
        onClear={clearPath}
        onOpen={() => void handleOpen()}
        onClosePlayback={handleClosePlayback}
      />
      <TrackViewer
        mode={mode}
        isTracking={isTracking}
        metric={colorMetric}
        showValidation={showValidation}
      />
    </div>
  );
}
