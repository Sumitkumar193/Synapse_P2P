import { app, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { AppSettings, DEFAULT_APP_SETTINGS } from '../shared/settings';
import { eventBus } from '../shared/EventBus';

export class SettingsManager {
  private static instance: SettingsManager;
  private settingsFilePath: string;
  private currentSettings: AppSettings;

  constructor() {
    const userDataDir = typeof app !== 'undefined' && app ? app.getPath('userData') : process.cwd();
    this.settingsFilePath = path.join(userDataDir, 'app_preferences.json');
    this.currentSettings = this.loadSettings();
  }

  public static getInstance(): SettingsManager {
    if (!SettingsManager.instance) {
      SettingsManager.instance = new SettingsManager();
    }
    return SettingsManager.instance;
  }

  public getSettings(): AppSettings {
    return { ...this.currentSettings };
  }

  public saveSettings(newSettings: Partial<AppSettings>): AppSettings {
    this.currentSettings = {
      ...this.currentSettings,
      ...newSettings,
    };

    try {
      fs.writeFileSync(this.settingsFilePath, JSON.stringify(this.currentSettings, null, 2), 'utf-8');
    } catch (err) {
      console.error('[SettingsManager] Failed to persist settings.json:', err);
    }

    // Set process environment variables dynamically for active worker processes
    if (this.currentSettings.openAiApiKey) {
      process.env.OPENAI_API_KEY = this.currentSettings.openAiApiKey;
    }
    process.env.WHISPER_PROVIDER = this.currentSettings.whisperProvider;

    eventBus.emit('chat_received', {
      id: `settings_${Date.now()}`,
      sender: '⚙️ Settings Manager',
      text: `App preferences updated dynamically (${this.currentSettings.llmProvider} / ${this.currentSettings.whisperProvider} STT)`,
      timestamp: Date.now(),
      isAi: true,
    });

    return this.getSettings();
  }

  public initializeIPC(): void {
    if (typeof ipcMain !== 'undefined' && ipcMain) {
      ipcMain.handle('GET_SETTINGS', () => this.getSettings());
      ipcMain.handle('SAVE_SETTINGS', (_event, newSettings: Partial<AppSettings>) => this.saveSettings(newSettings));
    }
  }

  private loadSettings(): AppSettings {
    try {
      if (fs.existsSync(this.settingsFilePath)) {
        const raw = fs.readFileSync(this.settingsFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        return { ...DEFAULT_APP_SETTINGS, ...parsed };
      }
    } catch (err) {
      console.warn('[SettingsManager] Using default preferences:', err);
    }
    return { ...DEFAULT_APP_SETTINGS };
  }
}

export function setupSettingsIPC(): SettingsManager {
  const manager = SettingsManager.getInstance();
  manager.initializeIPC();
  return manager;
}
