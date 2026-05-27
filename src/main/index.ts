import { app, BrowserWindow, globalShortcut, ipcMain, shell } from 'electron';
import { join } from 'node:path';
import { IPC } from '@shared/ipc';
import type { AppSettings } from '@shared/telemetry';
import { ForzaUdpServer } from './udpServer';
import { getSettings, setSettings } from './settings';
import { Recorder } from './recorder';
import { DualSenseFeedback } from './dualsenseFeedback';

// Disable hardware acceleration only if we hit issues on Linux/older GPUs.
// We leave it on by default because the graphs benefit from GPU compositing.

let mainWindow: BrowserWindow | null = null;
let server: ForzaUdpServer | null = null;
const recorder = new Recorder();
let registeredHotkey: string | null = null;
let feedback: DualSenseFeedback | null = null;

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

  // Open external links in the user's browser instead of new Electron windows.
  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // electron-vite serves the renderer over HMR in dev and writes a static file in build.
  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
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
    mainWindow?.webContents.send(IPC.RECORDING_STATUS, status);
  } else {
    const status = recorder.start();
    mainWindow?.webContents.send(IPC.RECORDING_STATUS, status);
  }
}

function startServer(port: number): void {
  if (server) {
    server.stop();
    server.removeAllListeners();
  }
  server = new ForzaUdpServer(port);

  server.on('packet', (data) => {
    // Stream every parsed packet to the renderer. At 60 Hz this is well within
    // IPC throughput; the renderer is responsible for any further coalescing.
    mainWindow?.webContents.send(IPC.TELEMETRY_PACKET, data);
    recorder.push(data);
    feedback?.push(data);
  });

  server.on('status', (status) => {
    mainWindow?.webContents.send(IPC.LISTENER_STATUS, status);
  });

  void server.start().catch((err) => {
    // Surface bind errors (e.g. EADDRINUSE) to the renderer so the UI can show them.
    const message = err instanceof Error ? err.message : String(err);
    mainWindow?.webContents.send(IPC.LISTENER_STATUS, {
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
    if (feedback) {
      const configKeys: (keyof AppSettings)[] = [
        'dualsensePort', 'dualsenseBrakeStrength', 'dualsenseBrakeMaxFreq',
        'dualsenseThrottleStrength', 'dualsenseThrottleMaxFreq',
      ];
      if (configKeys.some((k) => patch[k] !== undefined)) {
        feedback.updateConfig({
          port: next.dualsensePort,
          brakeStrength: next.dualsenseBrakeStrength,
          brakeMaxFreq: next.dualsenseBrakeMaxFreq,
          throttleStrength: next.dualsenseThrottleStrength,
          throttleMaxFreq: next.dualsenseThrottleMaxFreq,
        });
      }
      if (patch.dualsenseEnabled !== undefined) {
        if (patch.dualsenseEnabled) feedback.enable();
        else feedback.disable();
      }
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

  ipcMain.handle(IPC.START_RECORDING, () => {
    const status = recorder.start();
    mainWindow?.webContents.send(IPC.RECORDING_STATUS, status);
    return status;
  });

  ipcMain.handle(IPC.STOP_RECORDING, async () => {
    const status = await recorder.stop();
    mainWindow?.webContents.send(IPC.RECORDING_STATUS, status);
    return status;
  });
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createMainWindow();
  const settings = getSettings();
  startServer(settings.port);
  registerRecordHotkey(settings.recordHotkey);
  feedback = new DualSenseFeedback({
    port: settings.dualsensePort,
    brakeStrength: settings.dualsenseBrakeStrength,
    brakeMaxFreq: settings.dualsenseBrakeMaxFreq,
    throttleStrength: settings.dualsenseThrottleStrength,
    throttleMaxFreq: settings.dualsenseThrottleMaxFreq,
  });
  if (settings.dualsenseEnabled) feedback.enable();

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
  feedback?.destroy();
});
