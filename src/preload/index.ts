import { contextBridge, ipcRenderer } from 'electron';

export interface ElectronAPI {
  getDesktopSources: (options?: { types?: string[]; thumbnailSize?: { width: number; height: number } }) => Promise<any[]>;
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  openNewWindow: () => void;
  signaling: {
    joinRoom: (roomId: string, peerId: string) => void;
    leaveRoom: (roomId: string, peerId: string) => void;
    sendMessage: (message: any) => void;
    onMessage: (callback: (message: any) => void) => void;
  };
}

const electronAPI: ElectronAPI = {
  getDesktopSources: (options) => ipcRenderer.invoke('GET_DESKTOP_SOURCES', options),
  minimizeWindow: () => ipcRenderer.send('WINDOW_MINIMIZE'),
  maximizeWindow: () => ipcRenderer.send('WINDOW_MAXIMIZE'),
  closeWindow: () => ipcRenderer.send('WINDOW_CLOSE'),
  openNewWindow: () => ipcRenderer.send('WINDOW_OPEN_NEW'),
  signaling: {
    joinRoom: (roomId, peerId) => ipcRenderer.send('SIGNALING_JOIN_ROOM', { roomId, peerId }),
    leaveRoom: (roomId, peerId) => ipcRenderer.send('SIGNALING_LEAVE_ROOM', { roomId, peerId }),
    sendMessage: (message) => ipcRenderer.send('SIGNALING_SEND_MESSAGE', message),
    onMessage: (callback) => {
      ipcRenderer.on('SIGNALING_MESSAGE', (_event, message) => callback(message));
    },
  },
};

try {
  contextBridge.exposeInMainWorld('electronAPI', electronAPI);
} catch (err) {
  console.warn('Could not expose electronAPI on window:', err);
  (window as any).electronAPI = electronAPI;
}
