import { create } from 'zustand';

interface RecordingStoreState {
  isRecording: boolean;
  startedAt: number | null;
  elapsedMs: number;
  _intervalId: ReturnType<typeof setInterval> | null;
  setRecording: (isRecording: boolean, startedAt: number | null) => void;
}

export const useRecordingStore = create<RecordingStoreState>((set, get) => ({
  isRecording: false,
  startedAt: null,
  elapsedMs: 0,
  _intervalId: null,

  setRecording(isRecording, startedAt) {
    const prev = get();
    if (prev._intervalId !== null) clearInterval(prev._intervalId);

    let intervalId: ReturnType<typeof setInterval> | null = null;
    if (isRecording && startedAt !== null) {
      intervalId = setInterval(() => {
        set({ elapsedMs: Date.now() - startedAt });
      }, 100);
    }

    set({
      isRecording,
      startedAt,
      elapsedMs: isRecording && startedAt !== null ? Date.now() - startedAt : 0,
      _intervalId: intervalId,
    });
  },
}));
