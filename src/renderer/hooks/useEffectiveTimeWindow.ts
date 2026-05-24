import { useSettingsStore } from '../store/settingsStore';
import { useRecordingStore } from '../store/recordingStore';

/**
 * Returns the time window (seconds) that charts should display.
 *
 * While recording, the window expands dynamically to always show the full
 * session so far. Once recording stops (and the file is saved), it reverts to
 * the user's configured global time window.
 */
export function useEffectiveTimeWindow(): number {
  const globalTimeWindow = useSettingsStore((s) => s.settings.globalTimeWindow);
  const isRecording = useRecordingStore((s) => s.isRecording);
  const elapsedMs = useRecordingStore((s) => s.elapsedMs);

  if (isRecording) {
    return Math.max(globalTimeWindow, elapsedMs / 1000);
  }
  return globalTimeWindow;
}
