import { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, NativeImage, clipboard } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

// Load environment variables from .env
dotenv.config();

// Suppress Chromium internal C++ log noise (WGC static frame timeouts)
app.commandLine.appendSwitch('log-level', '3');
app.commandLine.appendSwitch('disable-features', 'WGCWindowCapturer,WGCDisplayCapturer,WgcCapturer');
app.commandLine.appendSwitch('enable-features', 'GDIWindowCapturer');

import { setupDesktopCapturerIPC } from './ipc/desktopCapturerHandler';
import { setupWindowIPC } from './ipc/windowHandler';
import { setupSignalingIPC } from './ipc/signalingHandler';

ipcMain.handle('READ_CLIPBOARD', () => {
  try {
    return clipboard.readText();
  } catch {
    return '';
  }
});

ipcMain.on('WRITE_CLIPBOARD', (_event, text: string) => {
  try {
    clipboard.writeText(text);
  } catch {}
});

let windows: Set<BrowserWindow> = new Set();
let tray: Tray | null = null;
let isQuitting: boolean = false;

function createTrayIcon(): NativeImage {
  const iconPath = path.join(__dirname, '../../assets/icon.jpg');
  if (fs.existsSync(iconPath)) {
    return nativeImage.createFromPath(iconPath).resize({ width: 32, height: 32 });
  }

  // SVG fallback if asset not present
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <rect width="32" height="32" rx="8" fill="#6366f1"/>
    <text x="16" y="21" font-size="13" font-weight="bold" fill="white" text-anchor="middle" font-family="sans-serif">P2P</text>
  </svg>`;
  return nativeImage.createFromBuffer(Buffer.from(svg));
}

function setupTray(): void {
  if (tray) return;

  const icon = createTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('P2P Screen Share');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '📺 Open P2P Screen Share',
      click: () => {
        windows.forEach((win) => {
          if (!win.isDestroyed()) {
            win.show();
            win.focus();
          }
        });
        if (windows.size === 0) {
          createWindow();
        }
      },
    },
    {
      label: '➕ Open 2nd Window',
      click: () => {
        createWindow();
      },
    },
    { type: 'separator' },
    {
      label: '🚪 Quit App',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    windows.forEach((win) => {
      if (!win.isDestroyed()) {
        win.show();
        win.focus();
      }
    });
    if (windows.size === 0) {
      createWindow();
    }
  });
}

function createWindow(): BrowserWindow {
  Menu.setApplicationMenu(null);

  const iconPath = path.join(__dirname, '../../assets/icon.jpg');

  const win = new BrowserWindow({
    width: 980,
    height: 640,
    minWidth: 880,
    minHeight: 560,
    title: 'P2P Screen Share',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
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

  // Forward Renderer console logs to terminal stdout during development
  win.webContents.on('console-message', (_event, _level, message) => {
    if (
      message.includes('P2PMediaSDK') ||
      message.includes('WebRTC') ||
      message.includes('Firebase') ||
      message.includes('Signaling') ||
      message.includes('Candidate') ||
      message.includes('STUN') ||
      message.includes('📩') ||
      message.includes('📤')
    ) {
      console.log(`[Terminal Dev Log] ${message}`);
    }
  });

  const rendererPath = path.join(__dirname, '../renderer/index.html');
  win.loadFile(rendererPath).catch((err) => {
    console.error('Failed to load renderer HTML:', err);
  });

  // Minimize to Tray on Close
  win.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      win.hide();
      console.log('[System Tray] 📌 Window minimized to system tray.');
    } else {
      windows.delete(win);
    }
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

  setupTray();
  createWindow();

  app.on('activate', () => {
    if (windows.size === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && isQuitting) {
    app.quit();
  }
});
