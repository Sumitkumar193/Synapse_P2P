import { app, BrowserWindow, Menu } from 'electron';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables from .env
dotenv.config();

import { setupDesktopCapturerIPC } from './ipc/desktopCapturerHandler';
import { setupWindowIPC } from './ipc/windowHandler';
import { setupSignalingIPC } from './ipc/signalingHandler';

let windows: Set<BrowserWindow> = new Set();

function createWindow(): BrowserWindow {
  Menu.setApplicationMenu(null);

  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1000,
    minHeight: 700,
    title: 'P2P Screen Share',
    frame: false,
    transparent: false,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  windows.add(win);

  const rendererPath = path.join(__dirname, '../renderer/index.html');
  win.loadFile(rendererPath).catch((err) => {
    console.error('Failed to load renderer HTML:', err);
  });

  win.on('closed', () => {
    windows.delete(win);
  });

  return win;
}

app.whenReady().then(() => {
  setupDesktopCapturerIPC();
  setupSignalingIPC();
  setupWindowIPC(
    () => BrowserWindow.getFocusedWindow() || (windows.size > 0 ? Array.from(windows)[0] : null),
    () => createWindow()
  );
  createWindow();

  app.on('activate', () => {
    if (windows.size === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
