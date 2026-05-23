import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '@shared/ipc';
import type { AppSettings, ListenerStatus, TelemetryData } from '@shared/telemetry';

/**
 * The API surface that contextBridge exposes to the renderer.
 *
 * Anything the renderer needs from the main process goes through here. There
 * is no nodeIntegration in the renderer, so this is the ONLY route.
 */
export interface ForzaApi {
  onTelemetry: (cb: (data: TelemetryData) => void) => () => void;
  onListenerStatus: (cb: (status: ListenerStatus) => void) => () => void;
  getListenerStatus: () => Promise<ListenerStatus | null>;
  getSettings: () => Promise<AppSettings>;
  setSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>;
  restartListener: (port: number) => Promise<ListenerStatus | null>;
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
  getListenerStatus: () => ipcRenderer.invoke(IPC.GET_LISTENER_STATUS),
  getSettings: () => ipcRenderer.invoke(IPC.GET_SETTINGS),
  setSettings: (patch) => ipcRenderer.invoke(IPC.SET_SETTINGS, patch),
  restartListener: (port) => ipcRenderer.invoke(IPC.RESTART_LISTENER, port),
};

contextBridge.exposeInMainWorld('forza', api);
