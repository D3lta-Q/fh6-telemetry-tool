import { app, BrowserWindow, dialog, globalShortcut, ipcMain, shell } from 'electron';
import { join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { IPC } from '@shared/ipc';
import type { AppSettings } from '@shared/telemetry';
import type { FztSession, FztSessionAny } from '@shared/track';
import { ForzaUdpServer } from './udpServer';
import { getSettings, setSettings } from './settings';
import { Recorder } from './recorder';

let mainWindow: BrowserWindow | null = null;
const childWindows: Map<string, BrowserWindow> = new Map();
let server: ForzaUdpServer | null = null;
const recorder = new Recorder();
let registeredHotkey: string | null = null;

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: 'Forza Telemetry',
    backgroundColor: '#0a0a0b',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url);
    return { action: 'deny' };
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

function createChildWindow(tab: string): void {
  if (childWindows.has(tab)) {
    childWindows.get(tab)!.focus();
    return;
  }

  const child = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    autoHideMenuBar: true,
    title: `Forza Telemetry — ${tab.charAt(0).toUpperCase() + tab.slice(1)}`,
    backgroundColor: '#0a0a0b',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  child.on('closed', () => {
    childWindows.delete(tab);
  });

  child.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url);
    return { action: 'deny' };
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    void child.loadURL(process.env['ELECTRON_RENDERER_URL'] + `?tab=${tab}`);
  } else {
    void child.loadFile(join(__dirname, '../renderer/index.html'), { query: { tab } });
  }

  // Forward telemetry packets and status to child windows
  childWindows.set(tab, child);
}

function registerRecordHotkey(hotkey: string): void {
  if (registeredHotkey) {
    globalShortcut.unregister(registeredHotkey);
    registeredHotkey = null;
  }
  try {
    const ok = globalShortcut.register(hotkey, () => {
      void toggleRecording();
    });
    if (ok) registeredHotkey = hotkey;
  } catch {
    // Invalid accelerator string - silently skip registration.
  }
}

async function toggleRecording(): Promise<void> {
  if (recorder.status.isRecording) {
    const status = await recorder.stop();
    broadcastToAll(IPC.RECORDING_STATUS, status);
  } else {
    const status = recorder.start();
    broadcastToAll(IPC.RECORDING_STATUS, status);
  }
}

function broadcastToAll(channel: string, ...args: unknown[]): void {
  mainWindow?.webContents.send(channel, ...args);
  for (const child of childWindows.values()) {
    child.webContents.send(channel, ...args);
  }
}

function startServer(port: number): void {
  if (server) {
    server.stop();
    server.removeAllListeners();
  }
  server = new ForzaUdpServer(port);

  server.on('packet', (data) => {
    broadcastToAll(IPC.TELEMETRY_PACKET, data);
    recorder.push(data);
  });

  server.on('status', (status) => {
    broadcastToAll(IPC.LISTENER_STATUS, status);
  });

  void server.start().catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    broadcastToAll(IPC.LISTENER_STATUS, {
      listening: false,
      port,
      packetsReceived: 0,
      lastPacketAt: null,
      error: message,
    });
  });
}

function registerIpcHandlers(): void {
  ipcMain.handle(IPC.GET_SETTINGS, () => getSettings());

  ipcMain.handle(IPC.SET_SETTINGS, (_event, patch: Partial<AppSettings>) => {
    const next = setSettings(patch);
    if (patch.port !== undefined && server && patch.port !== server.getStatus().port) {
      void server.restart(patch.port);
    }
    if (patch.recordHotkey !== undefined) {
      registerRecordHotkey(patch.recordHotkey);
    }
    return next;
  });

  ipcMain.handle(IPC.GET_LISTENER_STATUS, () => server?.getStatus() ?? null);

  ipcMain.handle(IPC.RESTART_LISTENER, async (_event, port: number) => {
    if (!server) {
      startServer(port);
      return null;
    }
    return server.restart(port);
  });

  ipcMain.handle(IPC.START_RECORDING, (_event, mode?: string) => {
    const status = recorder.start((mode as 'free' | 'race') ?? 'free');
    broadcastToAll(IPC.RECORDING_STATUS, status);
    return status;
  });

  ipcMain.handle(IPC.STOP_RECORDING, async () => {
    const status = await recorder.stop();
    broadcastToAll(IPC.RECORDING_STATUS, status);
    return status;
  });

  ipcMain.handle(IPC.SAVE_TRACK_SESSION, async (_event, session: FztSession) => {
    const d = new Date(session.startedAt);
    const MM = String(d.getMonth() + 1).padStart(2, '0');
    const DD = String(d.getDate()).padStart(2, '0');
    const YYYY = d.getFullYear();
    const HH = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const SS = String(d.getSeconds()).padStart(2, '0');
    const ts = `${MM}-${DD}-${YYYY}_${HH}-${mm}-${SS}`;
    const result = await dialog.showSaveDialog({
      title: 'Save Telemetry Session',
      defaultPath: `forza-session-${session.mode}-${ts}.fzt`,
      filters: [{ name: 'Forza Telemetry Session', extensions: ['fzt'] }],
    });
    if (!result.canceled && result.filePath) {
      await writeFile(result.filePath, JSON.stringify(session));
      return 'saved';
    }
    return 'cancelled';
  });

  ipcMain.handle(IPC.OPEN_TRACK_SESSION, async () => {
    const result = await dialog.showOpenDialog({
      title: 'Open Telemetry Session',
      filters: [
        { name: 'Forza Telemetry Session', extensions: ['fzt'] },
        { name: 'Legacy Recording', extensions: ['fzr'] },
      ],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const raw = await readFile(result.filePaths[0], 'utf-8');
    const parsed = JSON.parse(raw) as FztSessionAny | { version: 1; packets: unknown[] };

    // Handle legacy .fzr format (packets-only)
    if ('packets' in parsed && !('frames' in parsed)) {
      const legacy = parsed as { version: 1; startedAt: number; endedAt: number; packets: any[] };
      return {
        version: 2,
        mode: 'free' as const,
        startedAt: legacy.startedAt,
        endedAt: legacy.endedAt,
        origin: { x: 0, y: 0, z: 0 },
        frames: [],
        laps: [],
        positionChanges: [],
        packets: legacy.packets,
      } satisfies FztSession;
    }

    // Handle v1 .fzt (track-only, no packets)
    if ((parsed as any).version === 1 && 'frames' in parsed) {
      return {
        ...(parsed as any),
        version: 2,
        packets: [],
      } satisfies FztSession;
    }

    return parsed as FztSession;
  });

  ipcMain.handle(IPC.POP_OUT_TAB, (_event, tab: string) => {
    createChildWindow(tab);
  });
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createMainWindow();
  const settings = getSettings();
  startServer(settings.port);
  registerRecordHotkey(settings.recordHotkey);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  server?.stop();
  globalShortcut.unregisterAll();
  recorder.abort();
});
