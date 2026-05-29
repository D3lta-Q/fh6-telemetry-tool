import { useCallback, useEffect, useRef, useState } from 'react';
import type { TelemetryData } from '@shared/telemetry';

/**
 * Records a test lap entirely in the renderer.
 *
 * Rather than going through the main-process Recorder (which prompts a save
 * dialog and is shared with the F9 hotkey), the refinement flow just taps the
 * live telemetry stream and buffers packets in memory for immediate analysis.
 * Nothing is written to disk.
 */
export function useTestLapRecorder() {
  const [recording, setRecording] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const bufferRef = useRef<TelemetryData[]>([]);
  const offRef = useRef<(() => void) | null>(null);

  const start = useCallback(() => {
    bufferRef.current = [];
    setFrameCount(0);
    offRef.current?.();
    offRef.current = window.forza.onTelemetry((data) => {
      bufferRef.current.push(data);
      // Throttle React updates: only re-render the counter every 15 frames.
      if (bufferRef.current.length % 15 === 0) setFrameCount(bufferRef.current.length);
    });
    setRecording(true);
  }, []);

  /** Stop recording and return the captured packets. */
  const stop = useCallback((): TelemetryData[] => {
    offRef.current?.();
    offRef.current = null;
    setRecording(false);
    const frames = bufferRef.current;
    setFrameCount(frames.length);
    return frames;
  }, []);

  useEffect(() => {
    return () => {
      offRef.current?.();
    };
  }, []);

  return { recording, frameCount, start, stop };
}
