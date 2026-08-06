import { ipcMain, BrowserWindow } from 'electron';

export function setupWindowIPC(getWindow: () => BrowserWindow | null, openNewWindow: () => void): void {
  ipcMain.on('WINDOW_MINIMIZE', () => {
    const win = getWindow();
    if (win) win.minimize();
  });

  ipcMain.on('WINDOW_MAXIMIZE', () => {
    const win = getWindow();
    if (win) {
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
    }
  });

  ipcMain.on('WINDOW_CLOSE', () => {
    const win = getWindow();
    if (win) win.close();
  });
}
