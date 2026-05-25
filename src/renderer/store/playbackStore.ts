import { create } from 'zustand';
import type { TelemetryData } from '@shared/telemetry';
import type { FztSession, FztSessionAny, TrackFrame } from '@shared/track';

/**
 * Shared playback store — the single source of truth for playback state
 * across both the Dashboard and Track tabs. When a session is loaded,
 * both tabs can read from it. Playing/seeking in one tab is reflected
 * immediately in the other.
 */

interface PlaybackStoreState {
  session: FztSession | null;
  packetIndex: number;
  frameIndex: number;
  isPlaying: boolean;

  loadSession: (raw: FztSessionAny) => void;
  closeSession: () => void;
  setPacketIndex: (index: number) => void;
  setFrameIndex: (index: number) => void;
  setPlaying: (playing: boolean) => void;
  seekToTime: (timeMs: number) => void;
  currentPacket: () => TelemetryData | null;
}

function upgradeSession(raw: FztSessionAny): FztSession {
  if (raw.version === 2) return raw;
  return {
    ...raw,
    version: 2,
    packets: [],
  };
}

function searchFrames(frames: TrackFrame[], targetAbsT: number): number {
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid]!.t <= targetAbsT) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function searchPackets(packets: TelemetryData[], targetAbsT: number): number {
  let lo = 0;
  let hi = packets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (packets[mid]!.receivedAt <= targetAbsT) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export const usePlaybackStore = create<PlaybackStoreState>((set, get) => ({
  session: null,
  packetIndex: 0,
  frameIndex: 0,
  isPlaying: false,

  loadSession(raw) {
    const session = upgradeSession(raw);
    set({ session, packetIndex: 0, frameIndex: 0, isPlaying: false });
  },

  closeSession() {
    set({ session: null, packetIndex: 0, frameIndex: 0, isPlaying: false });
  },

  setPacketIndex(index) {
    const { session } = get();
    if (!session) return;
    set({ packetIndex: index });
    if (session.packets.length > 0 && session.frames.length > 0) {
      const pkt = session.packets[index];
      if (pkt) {
        const fi = searchFrames(session.frames, pkt.receivedAt);
        set({ frameIndex: fi });
      }
    }
  },

  setFrameIndex(index) {
    const { session } = get();
    if (!session) return;
    set({ frameIndex: index });
    if (session.packets.length > 0 && session.frames.length > 0) {
      const frame = session.frames[index];
      if (frame) {
        const pi = searchPackets(session.packets, frame.t);
        set({ packetIndex: pi });
      }
    }
  },

  setPlaying(playing) {
    set({ isPlaying: playing });
  },

  seekToTime(timeMs) {
    const { session } = get();
    if (!session) return;
    const absTime = session.startedAt + timeMs;

    let fi = 0;
    if (session.frames.length > 0) {
      fi = searchFrames(session.frames, absTime);
    }

    let pi = 0;
    if (session.packets.length > 0) {
      pi = searchPackets(session.packets, absTime);
    }

    set({ frameIndex: fi, packetIndex: pi });
  },

  currentPacket() {
    const { session, packetIndex } = get();
    if (!session || session.packets.length === 0) return null;
    return session.packets[packetIndex] ?? null;
  },
}));
