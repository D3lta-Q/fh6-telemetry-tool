import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { join } from 'node:path';
import { IPC } from '@shared/ipc';
import type { AppSettings } from '@shared/telemetry';
import { ForzaUdpServer } from './udpServer';
import { getSettings, setSettings } from './settings';

// Disable hardware acceleration only if we hit issues on Linux/older GPUs.
// We leave it on by default because the graphs benefit from GPU compositing.

let mainWindow: BrowserWindow | null = null;
let server: ForzaUdpServer | null = null;

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
    // If the port changed, restart the listener so the UI feels responsive.
    if (patch.port !== undefined && server && patch.port !== server.getStatus().port) {
      void server.restart(patch.port);
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
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createMainWindow();
  startServer(getSettings().port);

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
});
