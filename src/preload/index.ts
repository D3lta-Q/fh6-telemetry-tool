import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '@shared/ipc';
import type { AppSettings, ListenerStatus, RecordingStatus, TelemetryData } from '@shared/telemetry';
import type { FztSession } from '@shared/track';

/**
 * The API surface that contextBridge exposes to the renderer.
 *
 * Anything the renderer needs from the main process goes through here. There
 * is no nodeIntegration in the renderer, so this is the ONLY route.
 */
export interface ForzaApi {
  onTelemetry: (cb: (data: TelemetryData) => void) => () => void;
  onListenerStatus: (cb: (status: ListenerStatus) => void) => () => void;
  onRecordingStatus: (cb: (status: RecordingStatus) => void) => () => void;
  getListenerStatus: () => Promise<ListenerStatus | null>;
  getSettings: () => Promise<AppSettings>;
  setSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>;
  restartListener: (port: number) => Promise<ListenerStatus | null>;
  startRecording: (mode?: string) => Promise<RecordingStatus>;
  stopRecording: () => Promise<RecordingStatus>;
  saveTrackSession: (session: FztSession) => Promise<'saved' | 'cancelled'>;
  openTrackSession: () => Promise<FztSession | null>;
  popOutTab: (tab: string) => Promise<void>;
  /** Get the tab this window should show (for popped-out windows). */
  getWindowTab: () => string | null;
}

const api: ForzaApi = {
  onTelemetry(cb) {
    const handler = (_event: Electron.IpcRendererEvent, data: TelemetryData) => cb(data);
    ipcRenderer.on(IPC.TELEMETRY_PACKET, handler);
    return () => ipcRenderer.removeListener(IPC.TELEMETRY_PACKET, handler);
  },
  onListenerStatus(cb) {
    const handler = (_event: Electron.IpcRendererEvent, status: ListenerStatus) => cb(status);
    ipcRenderer.on(IPC.LISTENER_STATUS, handler);
    return () => ipcRenderer.removeListener(IPC.LISTENER_STATUS, handler);
  },
  onRecordingStatus(cb) {
    const handler = (_event: Electron.IpcRendererEvent, status: RecordingStatus) => cb(status);
    ipcRenderer.on(IPC.RECORDING_STATUS, handler);
    return () => ipcRenderer.removeListener(IPC.RECORDING_STATUS, handler);
  },
  getListenerStatus: () => ipcRenderer.invoke(IPC.GET_LISTENER_STATUS),
  getSettings: () => ipcRenderer.invoke(IPC.GET_SETTINGS),
  setSettings: (patch) => ipcRenderer.invoke(IPC.SET_SETTINGS, patch),
  restartListener: (port) => ipcRenderer.invoke(IPC.RESTART_LISTENER, port),
  startRecording: (mode) => ipcRenderer.invoke(IPC.START_RECORDING, mode),
  stopRecording: () => ipcRenderer.invoke(IPC.STOP_RECORDING),
  saveTrackSession: (session) => ipcRenderer.invoke(IPC.SAVE_TRACK_SESSION, session),
  openTrackSession: () => ipcRenderer.invoke(IPC.OPEN_TRACK_SESSION),
  popOutTab: (tab) => ipcRenderer.invoke(IPC.POP_OUT_TAB, tab),
  getWindowTab() {
    // In Electron preload, `location` is available via the global scope
    const params = new URLSearchParams((globalThis as any).location?.search ?? '');
    return params.get('tab');
  },
};

contextBridge.exposeInMainWorld('forza', api);
