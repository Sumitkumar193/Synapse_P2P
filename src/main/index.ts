import { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, NativeImage, clipboard, globalShortcut } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

// Load environment variables from .env
dotenv.config();

// Single Instance Lock: Ensure only 1 instance of the application runs at any time
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  console.log('[Main Process] ⛔ Another instance of P2P Screen Share is already running. Exiting secondary process...');
  process.exit(0);
}

// When a second instance is launched, focus the existing primary window
app.on('second-instance', () => {
  windows.forEach((win) => {
    if (!win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });
});

// Suppress Chromium internal C++ log noise (WGC static frame timeouts)
app.commandLine.appendSwitch('log-level', '3');
app.commandLine.appendSwitch('disable-features', 'WGCWindowCapturer,WGCDisplayCapturer,WgcCapturer');
app.commandLine.appendSwitch('enable-features', 'GDIWindowCapturer');

import { setupDesktopCapturerIPC } from './ipc/desktopCapturerHandler';
import { setupWindowIPC } from './ipc/windowHandler';
import { setupSignalingIPC } from './ipc/signalingHandler';
import { AudioWorkerController } from '../workers/audioWorker';
import { setupIPCProxyHandlers } from './ipcProxy';
import { setupSettingsIPC, SettingsManager } from './settingsManager';
import { setupWhisperDownloaderIPC } from './whisperDownloader';

let audioWorkerInstance: AudioWorkerController | null = null;
let realtimeBusInfo: { port: number; token: string } | null = null;


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

ipcMain.handle('TRIGGER_SCREENSHOT_AI', async (_event, customPrompt?: string) => {
  const { eventBus } = require('../shared/EventBus');
  console.log('[Main Process 📸] IPC trigger for Screenshot AI analysis received');
  eventBus.emit('ai.trigger_screen_analysis', { prompt: customPrompt });
  return { success: true };
});

ipcMain.handle('GET_REALTIME_BUS_INFO', () => {
  return realtimeBusInfo;
});

ipcMain.handle('PROCESS_PDF_RESUME', async (_event, base64Pdf: string) => {
  try {
    const { GeminiDirectProvider, OpenAIProvider } = require('../agent/ai');
    let provider: any = null;
    try {
      provider = new GeminiDirectProvider();
    } catch {
      try {
        provider = new OpenAIProvider();
      } catch (err: any) {
        return { success: false, error: 'No active AI Provider API Key configured. Please set GEMINI_API_KEY or OPENAI_API_KEY in .env or Settings.' };
      }
    }

    const cleanBase64 = base64Pdf.replace(/^data:application\/pdf;base64,/, '').trim();
    const pdfBuffer = Buffer.from(cleanBase64, 'base64');

    let rawPdfText = '';
    try {
      const pdfStr = pdfBuffer.toString('utf8');
      const textMatches = pdfStr.match(/\(([^)]+)\)\s*(?:Tj|TJ)/g);
      if (textMatches) {
        rawPdfText = textMatches
          .map((m) => m.replace(/[()]/g, '').trim())
          .filter((t) => t.length > 2)
          .join(' ');
      }
    } catch {}

    console.log('[Main Process 📄] Sending PDF resume to AI Provider (maxTokens: 8192) for content-aware extraction & RAG indexing...');
    
    let extractedText = '';
    try {
      const response = await provider.complete(
        [
          {
            role: 'user',
            content: `Extract the COMPLETE text and content of this candidate resume PDF file into clean, well-organized Markdown sections (Professional Summary, Technical Skills, Work Experience, Key Projects, Education, Certifications). Include ALL bullet points, metrics, company names, job titles, and tech stack details verbatim from top to bottom. Output clean Markdown only without any truncation or conversational chatter.`,
            images: [
              {
                mimeType: 'application/pdf',
                data: cleanBase64,
              },
            ],
          },
        ],
        { maxTokens: 8192, temperature: 0.2 }
      );
      extractedText = response.content ? response.content.trim() : '';
    } catch (aiErr: any) {
      console.warn('[Main Process 📄] AI PDF extraction notice:', aiErr.message || aiErr);
    }

    const finalText = extractedText || rawPdfText;

    if (!finalText || finalText.length < 20) {
      return { success: false, error: 'Could not extract complete text from PDF. Please paste the resume text into the manager.' };
    }

    return { success: true, text: finalText };
  } catch (err: any) {
    console.error('[Main Process 📄] Error processing PDF resume via AI:', err);
    return { success: false, error: err.message || 'Failed to process PDF resume with AI.' };
  }
});

ipcMain.handle('SAVE_RESUME_MARKDOWN', async (_event, markdownText: string) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const resumePath = path.resolve(__dirname, '../../assets/resume.md');
    fs.writeFileSync(resumePath, markdownText, 'utf8');
    console.log('[Main Process 📄] Saved updated resume markdown to assets/resume.md');
    return { success: true };
  } catch (err: any) {
    console.warn('[Main Process 📄] Notice writing assets/resume.md:', err.message);
    return { success: false, error: err.message };
  }
});

// Receive 16kHz Int16 PCM audio chunks from renderer AudioStreamer (local mic or remote speaker), feed to Whisper STT
ipcMain.on('AUDIO_CHUNK', (_event, payload: any) => {
  if (!audioWorkerInstance || !payload) return;
  
  let buffer: Buffer | null = null;
  let speaker: 'local' | 'remote' = 'local';

  if (payload instanceof ArrayBuffer || ArrayBuffer.isView(payload) || Buffer.isBuffer(payload)) {
    buffer = Buffer.from(payload as any);
  } else if (payload.buffer) {
    buffer = Buffer.from(payload.buffer);
    if (payload.speaker) speaker = payload.speaker;
  }

  if (buffer) {
    audioWorkerInstance.processAudioChunk(buffer, speaker);
  }
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

app.whenReady().then(async () => {
  setupDesktopCapturerIPC();
  setupSignalingIPC();
  setupIPCProxyHandlers();
  setupSettingsIPC();
  setupWhisperDownloaderIPC();
  setupWindowIPC(
    () => BrowserWindow.getFocusedWindow() || (windows.size > 0 ? Array.from(windows)[0] : null),
    () => createWindow()
  );

  // Auto-approve permissions for media devices and speaker selection
  const { session } = require('electron');
  session.defaultSession.setPermissionCheckHandler((_webContents: any, permission: string) => {
    if (permission === 'media' || permission === 'speaker-selection') return true;
    return true;
  });
  session.defaultSession.setPermissionRequestHandler((_webContents: any, permission: string, callback: any) => {
    if (permission === 'media' || permission === 'speaker-selection') return callback(true);
    callback(true);
  });

  // Initialize Realtime Bus & Audio Worker
  try {
    // Read user STT preferences and forward to Whisper engine
    const settingsManager = SettingsManager.getInstance();
    const settings = settingsManager.getSettings();
    audioWorkerInstance = new AudioWorkerController(
      undefined,
      settings.whisperProvider,
      {
        modelName: settings.localWhisperModel,
        threads: settings.whisperThreads,
      },
    );
    realtimeBusInfo = await audioWorkerInstance.initialize(0);
    console.log(`[Main Process] 🟢 Realtime Bus listening on 127.0.0.1:${realtimeBusInfo.port} (Token: ${realtimeBusInfo.token.substring(0, 8)}...)`);

    // Relay Whisper STT transcript events from main-process EventBus back to ALL renderer windows
    const { eventBus: mainEventBus } = require('../shared/EventBus');
    const relayTranscript = (evt: any, isFinal: boolean) => {
      const payload = { text: evt.text, speaker: evt.speaker, isFinal, timestamp: evt.timestamp };
      windows.forEach((win) => {
        if (!win.isDestroyed()) {
          win.webContents.send('TRANSCRIPT_EVENT', payload);
        }
      });
    };
    mainEventBus.on('transcript.partial', (evt: any) => relayTranscript(evt, false));
    mainEventBus.on('transcript.final', (evt: any) => relayTranscript(evt, true));

    // Initialize Agentic Whisper Question Handler & MCP Adapter in Main Process
    try {
      const { MCPAdapter } = require('../agent/mcp/MCPAdapter');
      const { AgenticWhisperQuestionHandler, OpenAIProvider, OllamaProvider, AntigravityProvider, GeminiDirectProvider } = require('../agent/ai');
      const mcpAdapter = new MCPAdapter();
      const osProxy = setupIPCProxyHandlers();
      mcpAdapter.setIPCProxyHandler(async (toolName: string, args: Record<string, any>) => {
        const res = await osProxy.executeOSTool(toolName, args);
        return res.result;
      });

      let provider;
      const envLlmProvider = (process.env.LLM_PROVIDER || '').toLowerCase();
      if (envLlmProvider === 'openai' || settings.llmProvider === 'openai') {
        provider = new OpenAIProvider(settings.openAiApiKey || process.env.OPENAI_API_KEY);
      } else if (envLlmProvider === 'ollama' || settings.llmProvider === 'ollama') {
        provider = new OllamaProvider({ baseUrl: settings.ollamaBaseUrl || 'http://localhost:11434', defaultModel: settings.ollamaModel || 'llama3.2' });
      } else if (envLlmProvider === 'antigravity' || settings.llmProvider === 'antigravity') {
        provider = new AntigravityProvider();
      } else if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || settings.llmProvider === 'gemini-direct') {
        provider = new GeminiDirectProvider();
      } else if (process.env.OPENAI_API_KEY) {
        provider = new OpenAIProvider(process.env.OPENAI_API_KEY);
      } else {
        provider = new GeminiDirectProvider();
      }

      new AgenticWhisperQuestionHandler(mcpAdapter, provider);
      console.log(`[Main Process] 🚀 Agentic Whisper Question Handler initialized with ${provider.name}!`);



      mainEventBus.on('chat_received', (msg: any) => {
        console.log(`[Main Process 📤 IPC] Relaying chat_received message to ${windows.size} window(s): "${msg.text?.substring(0, 60)}..."`);
        windows.forEach((win) => {
          if (!win.isDestroyed()) {
            win.webContents.send('CHAT_MESSAGE_RECEIVED', msg);
          }
        });
      });

    } catch (agentErr) {
      console.warn('[Main Process] Could not initialize Agentic Question Handler:', agentErr);
    }
  } catch (err) {
    console.error('[Main Process] Failed to initialize Realtime Bus:', err);
  }



  setupTray();
  createWindow();

  // Register Global System-Wide Hotkeys for Screenshot AI analysis
  try {
    const isRegistered = globalShortcut.register('CommandOrControl+Shift+S', () => {
      console.log('[Shortcut 📸] System-wide hotkey Ctrl+Shift+S triggered!');
      const { eventBus } = require('../shared/EventBus');
      eventBus.emit('ai.trigger_screen_analysis', {
        prompt: 'Analyze the attached screenshot. Detect the active coding language selected in the editor header (e.g., JavaScript/Node.js, Python, C++, Java, TypeScript) or starter code. IF code is present with a bug, provide the 1-3 line surgical fix. IF a coding problem is shown (e.g. LeetCode, HackerRank, IDE), provide the MINIMAL working code solution strictly in that detected language with concise inline comments explaining why.',
      });
      windows.forEach((win) => {
        if (!win.isDestroyed()) {
          win.webContents.send('SHORTCUT_TRIGGER_SCREENSHOT_AI');
        }
      });
    });

    const isQuizRegistered = globalShortcut.register('CommandOrControl+1', () => {
      console.log('[Shortcut 🎯] System-wide hotkey Ctrl+1 triggered for Quiz / Coding analysis!');
      const { eventBus } = require('../shared/EventBus');
      eventBus.emit('ai.trigger_screen_analysis', {
        prompt: 'Analyze the attached screenshot. IF it is a quiz/multiple-choice question, state the CORRECT option clearly first. IF it is a coding problem (e.g. LeetCode, HackerRank, IDE), detect the active coding language selected in the editor header (e.g. JavaScript/Node.js, Python, C++, Java, TypeScript) or starter code, and provide the MINIMAL working code solution strictly in that detected language with concise inline comments explaining why.',
      });
      windows.forEach((win) => {
        if (!win.isDestroyed()) {
          win.webContents.send('SHORTCUT_TRIGGER_SCREENSHOT_AI', { mode: 'quiz' });
        }
      });
    });

    if (isRegistered || isQuizRegistered) {
      console.log('[Main Process] ⌨️ Global Shortcuts registered: Ctrl+Shift+S (General AI) | Ctrl+1 (Quiz MCQ AI)');
    }
  } catch (shortcutErr) {
    console.warn('[Main Process] Could not register globalShortcuts:', shortcutErr);
  }

  app.on('second-instance', () => {
    // Focus main window if user attempts to launch second instance
    windows.forEach((win) => {
      if (!win.isDestroyed()) {
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
      }
    });
  });

  app.on('activate', () => {
    if (windows.size === 0) {
      createWindow();
    }
  });
});


app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && isQuitting) {
    app.quit();
  }
});
