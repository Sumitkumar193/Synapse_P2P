import { contextBridge, ipcRenderer } from 'electron';

export interface ElectronAPI {
  getDesktopSources: (options?: { types?: string[]; thumbnailSize?: { width: number; height: number } }) => Promise<any[]>;
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  openNewWindow: () => void;
  readClipboardText: () => Promise<string>;
  writeClipboardText: (text: string) => void;
  getSettings: () => Promise<any>;
  saveSettings: (settings: any) => Promise<any>;
  checkModelExists: (modelName: string, isMultilingual?: boolean) => Promise<{ exists: boolean; filePath?: string; fileName: string }>;
  downloadWhisperModel: (modelName: string, isMultilingual?: boolean) => Promise<{ success: boolean; filePath?: string; error?: string }>;
  onModelDownloadProgress: (callback: (progress: any) => void) => () => void;
  sendAudioChunk: (buffer: ArrayBuffer) => void;
  onTranscript: (callback: (evt: any) => void) => void;
  onChatMessage: (callback: (msg: any) => void) => void;
  triggerScreenshotAi: (prompt?: string) => Promise<any>;
  onShortcutTriggered: (callback: (data?: any) => void) => void;
  processPdfResume: (base64Pdf: string) => Promise<{ success: boolean; text?: string; error?: string }>;
  saveResumeMarkdown: (markdownText: string) => Promise<{ success: boolean; error?: string }>;

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
  readClipboardText: () => ipcRenderer.invoke('READ_CLIPBOARD'),
  writeClipboardText: (text: string) => ipcRenderer.send('WRITE_CLIPBOARD', text),
  getSettings: () => ipcRenderer.invoke('GET_SETTINGS'),
  saveSettings: (settings: any) => ipcRenderer.invoke('SAVE_SETTINGS', settings),
  checkModelExists: (modelName: string, isMultilingual?: boolean) => ipcRenderer.invoke('CHECK_MODEL_EXISTS', { modelName, isMultilingual }),
  downloadWhisperModel: (modelName: string, isMultilingual?: boolean) => ipcRenderer.invoke('DOWNLOAD_WHISPER_MODEL', { modelName, isMultilingual }),
  onModelDownloadProgress: (callback: (progress: any) => void) => {
    const handler = (_event: any, progress: any) => callback(progress);
    ipcRenderer.on('WHISPER_MODEL_DOWNLOAD_PROGRESS', handler);
    return () => ipcRenderer.removeListener('WHISPER_MODEL_DOWNLOAD_PROGRESS', handler);
  },
  sendAudioChunk: (buffer: ArrayBuffer, speaker: 'local' | 'remote' = 'local') => ipcRenderer.send('AUDIO_CHUNK', { buffer, speaker }),

  onTranscript: (callback: (evt: any) => void) => {
    ipcRenderer.on('TRANSCRIPT_EVENT', (_event, evt) => callback(evt));
  },
  onChatMessage: (callback: (msg: any) => void) => {
    ipcRenderer.on('CHAT_MESSAGE_RECEIVED', (_event, msg) => callback(msg));
  },
  triggerScreenshotAi: (prompt?: string) => ipcRenderer.invoke('TRIGGER_SCREENSHOT_AI', prompt),
  onShortcutTriggered: (callback: (data?: any) => void) => {
    ipcRenderer.on('SHORTCUT_TRIGGER_SCREENSHOT_AI', (_event, data) => callback(data));
  },
  processPdfResume: (base64Pdf: string) => ipcRenderer.invoke('PROCESS_PDF_RESUME', base64Pdf),
  saveResumeMarkdown: (markdownText: string) => ipcRenderer.invoke('SAVE_RESUME_MARKDOWN', markdownText),

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
  contextBridge.exposeInMainWorld('api', electronAPI);
} catch (err) {
  console.warn('Could not expose electronAPI on window:', err);
  (window as any).electronAPI = electronAPI;
  (window as any).api = electronAPI;
}

