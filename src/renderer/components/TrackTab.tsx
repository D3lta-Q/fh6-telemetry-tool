import { useState } from 'react';
import { useTrackStore } from '../store/trackStore';
import { TrackViewer } from './track/TrackViewer';
import { TrackControls } from './track/TrackControls';
import type { TrackMode, PathColorMetric } from '@shared/track';

/**
 * The "Track" tab — full 3D path visualisation for the vehicle session.
 *
 * All recording logic lives in trackStore; this component handles the
 * UI layer (mode/metric selectors, start/stop/save, file open/close).
 */
export function TrackTab() {
  const isTracking = useTrackStore((s) => s.isTracking);
  const startTracking = useTrackStore((s) => s.startTracking);
  const stopTracking = useTrackStore((s) => s.stopTracking);
  const frames = useTrackStore((s) => s.frames);
  const laps = useTrackStore((s) => s.laps);
  const positionChanges = useTrackStore((s) => s.positionChanges);
  const startedAt = useTrackStore((s) => s.startedAt);
  const origin = useTrackStore((s) => s.origin);
  const setPlaybackSession = useTrackStore((s) => s.setPlaybackSession);
  const colorMetric = useTrackStore((s) => s.colorMetric);
  const setColorMetric = useTrackStore((s) => s.setColorMetric);

  const [mode, setMode] = useState<TrackMode>('free');

  const handleStart = () => {
    startTracking(mode);
  };

  const handleStop = async () => {
    stopTracking();

    if (frames.length === 0) return;

    const session = {
      version: 1 as const,
      mode,
      startedAt: startedAt ?? Date.now(),
      endedAt: Date.now(),
      origin: origin ?? { x: 0, y: 0, z: 0 },
      frames,
      laps,
      positionChanges,
    };

    await window.forza.saveTrackSession(session);
  };

  const handleOpen = async () => {
    const session = await window.forza.openTrackSession();
    if (session) setPlaybackSession(session);
  };

  const handleClosePlayback = () => {
    setPlaybackSession(null);
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
