import { AppSettings, DEFAULT_APP_SETTINGS, AppThemeMode } from '../../shared/settings';
import { themeManager } from '../utils/themeManager';
import { useAppStore } from '../store/useAppStore';
import { WHISPER_MODELS, SUPPORTED_LANGUAGES } from '../../shared/whisperModels';
import { telegramRelayService } from '../../agent/telegram/TelegramRelayService';

export type SettingsTabId =
  | 'general'
  | 'signaling'
  | 'speech'
  | 'copilot'
  | 'privacy'
  | 'skills'
  | 'connectors'
  | 'plugins';

/**
 * Dark Glassmorphism Sidebar Settings Panel Modal (Matching App UI Aesthetics).
 */
export class SettingsPanelComponent {
  private settings: AppSettings = { ...DEFAULT_APP_SETTINGS };
  private containerEl: HTMLElement | null = null;
  private isVisible = false;
  private activeTab: SettingsTabId = 'general';
  private searchQuery = '';

  public mount(container: HTMLElement): void {
    this.containerEl = container;
    if (typeof window !== 'undefined') {
      (window as any).settingsComponentInstance = this;
    }
    this.loadCurrentSettings();
  }

  public show(tab?: SettingsTabId): void {
    if (tab) this.activeTab = tab;
    this.isVisible = true;
    this.render();
    this.loadCurrentSettings().then(() => this.render());
  }

  public hide(): void {
    this.isVisible = false;
    if (this.containerEl) {
      this.containerEl.innerHTML = '';
    }
  }

  public toggle(): void {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  public setTab(tab: SettingsTabId): void {
    this.activeTab = tab;
    if (!this.containerEl || !this.isVisible) return;

    // Update active class on nav items without destroying DOM elements
    if (typeof this.containerEl.querySelectorAll === 'function') {
      const navItems = this.containerEl.querySelectorAll('.settings-nav-item-dark');
      navItems.forEach((item) => {
        const targetId = item.getAttribute('data-tab-id');
        if (targetId === tab) {
          item.classList.add('active');
        } else {
          item.classList.remove('active');
        }
      });
    }

    // Update main content area scroll container
    const contentArea = typeof this.containerEl.querySelector === 'function'
      ? this.containerEl.querySelector('.settings-content-scroll-dark')
      : null;
    if (contentArea) {
      contentArea.innerHTML = this.renderActiveTabContent();
    } else {
      this.render();
    }

  }

  public async loadCurrentSettings(): Promise<void> {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.getSettings) {
      try {
        const res = await (window as any).electronAPI.getSettings();
        if (res) {
          this.settings = res;
          telegramRelayService.updateFromSettings(res);
          if (res.enableHosting !== undefined) {
            useAppStore.getState().setEnableHosting(res.enableHosting);
          }
          themeManager.applyTheme(this.settings.appTheme || 'dark-glass');
        }
      } catch {}
    }
  }

  public async saveSettings(): Promise<void> {
    if (!this.containerEl) return;

    // Read active form inputs safely (only override if element exists in active DOM tab)
    const userName = (this.containerEl.querySelector('#settingUserName') as HTMLInputElement)?.value || this.settings.userName;
    const userRole = (this.containerEl.querySelector('#settingUserRole') as HTMLSelectElement)?.value || this.settings.userRole;
    const appTheme = (this.containerEl.querySelector('#settingAppTheme') as HTMLSelectElement)?.value as AppThemeMode || this.settings.appTheme || 'dark-glass';
    const signalingMethod = (this.containerEl.querySelector('#settingSignalingMethod') as HTMLSelectElement)?.value as any || this.settings.signalingMethod;

    const whisperProvider = (this.containerEl.querySelector('#settingWhisperProvider') as HTMLSelectElement)?.value as any || this.settings.whisperProvider;
    const localWhisperModel = (this.containerEl.querySelector('#settingWhisperModel') as HTMLSelectElement)?.value as any || this.settings.localWhisperModel;
    const whisperMultilingualEl = this.containerEl.querySelector('#settingWhisperMultilingual') as HTMLInputElement | null;
    const whisperMultilingual = whisperMultilingualEl ? whisperMultilingualEl.checked : (this.settings.whisperMultilingual ?? true);
    const whisperLanguage = (this.containerEl.querySelector('#settingWhisperLanguage') as HTMLSelectElement)?.value || this.settings.whisperLanguage || 'auto';
    const whisperThreadsEl = this.containerEl.querySelector('#settingWhisperThreads') as HTMLInputElement | null;
    const whisperThreads = whisperThreadsEl ? parseInt(whisperThreadsEl.value || '4', 10) : this.settings.whisperThreads;
    const openAiApiKeyEl = this.containerEl.querySelector('#settingOpenAiKey') as HTMLInputElement | null;
    const openAiApiKey = openAiApiKeyEl ? openAiApiKeyEl.value : this.settings.openAiApiKey;

    const llmProvider = (this.containerEl.querySelector('#settingLlmProvider') as HTMLSelectElement)?.value as any || this.settings.llmProvider;
    const openAiModel = (this.containerEl.querySelector('#settingOpenAiModel') as HTMLInputElement)?.value || this.settings.openAiModel;
    const ollamaBaseUrl = (this.containerEl.querySelector('#settingOllamaUrl') as HTMLInputElement)?.value || this.settings.ollamaBaseUrl;
    const ollamaModel = (this.containerEl.querySelector('#settingOllamaModel') as HTMLInputElement)?.value || this.settings.ollamaModel;
    const systemPromptInstructions = (this.containerEl.querySelector('#settingSystemPrompt') as HTMLTextAreaElement)?.value || this.settings.systemPromptInstructions;

    const enableHostingEl = this.containerEl.querySelector('#settingEnableHosting') as HTMLInputElement | null;
    const enableHosting = enableHostingEl ? enableHostingEl.checked : (this.settings.enableHosting ?? true);

    const autoCaptureEl = this.containerEl.querySelector('#settingAutoCapture') as HTMLInputElement | null;
    const autoCaptureOnQuestion = autoCaptureEl ? autoCaptureEl.checked : (this.settings.autoCaptureOnQuestion ?? true);

    const requireApprovalEl = this.containerEl.querySelector('#settingRequireApproval') as HTMLInputElement | null;
    const requireApprovalForOsTools = requireApprovalEl ? requireApprovalEl.checked : (this.settings.requireApprovalForOsTools ?? true);

    const autoOpenChatEl = this.containerEl.querySelector('#settingAutoOpenChat') as HTMLInputElement | null;
    const autoOpenChatPanel = autoOpenChatEl ? autoOpenChatEl.checked : (this.settings.autoOpenChatPanel ?? true);

    const enableDualPanelsEl = this.containerEl.querySelector('#settingDualPanels') as HTMLInputElement | null;
    const enableDualSharingJoinPanels = enableDualPanelsEl ? enableDualPanelsEl.checked : (this.settings.enableDualSharingJoinPanels ?? true);

    const enableTelegramRelayEl = this.containerEl.querySelector('#settingEnableTelegramRelay') as HTMLInputElement | null;
    const enableTelegramRelay = enableTelegramRelayEl ? enableTelegramRelayEl.checked : (this.settings.enableTelegramRelay ?? false);
    const telegramBotToken = (this.containerEl.querySelector('#settingTelegramBotToken') as HTMLInputElement)?.value ?? this.settings.telegramBotToken;
    const telegramChatId = (this.containerEl.querySelector('#settingTelegramChatId') as HTMLInputElement)?.value ?? this.settings.telegramChatId;

    this.settings = {
      ...this.settings,
      userName,
      userRole,
      appTheme,
      signalingMethod,
      whisperProvider,
      localWhisperModel,
      whisperMultilingual,
      whisperLanguage,
      whisperThreads,
      openAiApiKey,
      llmProvider,
      openAiModel,
      ollamaBaseUrl,
      ollamaModel,
      systemPromptInstructions,
      enableHosting,
      autoCaptureOnQuestion,
      requireApprovalForOsTools,
      autoOpenChatPanel,
      enableDualSharingJoinPanels,
      enableTelegramRelay,
      telegramBotToken,
      telegramChatId,
    };

    telegramRelayService.updateFromSettings(this.settings);
    useAppStore.getState().setEnableHosting(enableHosting);
    themeManager.applyTheme(appTheme);

    // If local Whisper is active, check if model exists or trigger download
    if (whisperProvider === 'local' && typeof window !== 'undefined' && (window as any).electronAPI?.checkModelExists) {
      try {
        const check = await (window as any).electronAPI.checkModelExists(localWhisperModel, whisperMultilingual);
        if (!check.exists) {
          console.log(`[Settings] Model ${localWhisperModel} not found locally. Launching downloader popup...`);
          if ((window as any).whisperDownloadModalInstance) {
            (window as any).whisperDownloadModalInstance.show(localWhisperModel, check.fileName);
          }
          await (window as any).electronAPI.downloadWhisperModel(localWhisperModel, whisperMultilingual);
        }
      } catch (err) {
        console.warn('[Settings] Error checking/downloading model:', err);
      }
    }

    if (typeof window !== 'undefined' && (window as any).electronAPI?.saveSettings) {
      try {
        await (window as any).electronAPI.saveSettings(this.settings);
      } catch {}
    }

    this.hide();
  }

  public render(): void {
    if (!this.containerEl) return;

    if (!this.isVisible) {
      this.containerEl.innerHTML = '';
      return;
    }

    this.containerEl.innerHTML = `
      <div class="settings-modal-backdrop" onclick="if(event.target === this) window.settingsComponentInstance?.hide()">
        <div class="settings-modal-card-dark" onclick="event.stopPropagation()">
          <!-- Sidebar Navigation -->
          <div class="settings-sidebar-dark">
            <div class="settings-search-box-dark">
              <span class="search-icon">🔍</span>
              <input
                type="text"
                placeholder="Search settings..."
                value="${this.searchQuery}"
                oninput="window.settingsComponentInstance?.handleSearch(this.value)"
              />
            </div>

            <div class="settings-nav-group-dark">
              <div class="nav-group-label-dark">Settings</div>
              ${this.renderNavItem('general', '⚙️', 'General')}
              ${this.renderNavItem('signaling', '⚡', 'Signaling & P2P')}
              ${this.renderNavItem('speech', '🎙️', 'Speech & Whisper')}
              ${this.renderNavItem('copilot', '🤖', 'AI Copilot')}
              ${this.renderNavItem('privacy', '🛡️', 'Privacy & Safety')}
            </div>

            <div class="settings-nav-group-dark">
              <div class="nav-group-label-dark">Customize</div>
              ${this.renderNavItem('skills', '🧰', 'Skills & Tools')}
              ${this.renderNavItem('connectors', '🔌', 'Connectors & MCP')}
              ${this.renderNavItem('plugins', '🧩', 'Plugins')}
            </div>
          </div>

          <!-- Main Content Area -->
          <div class="settings-main-content-dark">
            <button class="settings-close-btn-dark" onclick="window.settingsComponentInstance?.hide()">✕</button>

            <div class="settings-content-scroll-dark">
              ${this.renderActiveTabContent()}
            </div>

            <div class="settings-footer-dark">
              <button class="btn-cancel-dark" onclick="window.settingsComponentInstance?.hide()">Cancel</button>
              <button class="btn-save-dark" onclick="window.settingsComponentInstance?.saveSettings()">Save Preferences</button>
            </div>
          </div>
        </div>
      </div>
    `;

    if (typeof window !== 'undefined') {
      (window as any).settingsComponentInstance = this;
    }
  }

  private renderNavItem(id: SettingsTabId, icon: string, label: string): string {
    const isActive = this.activeTab === id;
    return `
      <div
        class="settings-nav-item-dark ${isActive ? 'active' : ''}"
        data-tab-id="${id}"
        onclick="event.preventDefault(); event.stopPropagation(); window.settingsComponentInstance?.setTab('${id}')"
      >
        <span class="nav-item-icon">${icon}</span>
        <span class="nav-item-label">${label}</span>
      </div>
    `;
  }

  public handleSearch(query: string): void {
    this.searchQuery = query.toLowerCase();
    if (this.searchQuery.includes('signal') || this.searchQuery.includes('p2p')) this.setTab('signaling');
    else if (this.searchQuery.includes('whisper') || this.searchQuery.includes('stt') || this.searchQuery.includes('speech')) this.setTab('speech');
    else if (this.searchQuery.includes('mcp') || this.searchQuery.includes('connector')) this.setTab('connectors');
    else if (this.searchQuery.includes('copilot') || this.searchQuery.includes('llm') || this.searchQuery.includes('gpt')) this.setTab('copilot');
  }

  private renderActiveTabContent(): string {
    switch (this.activeTab) {
      case 'general':
        return `
          <h2 class="tab-title-dark">Profile & General</h2>
          
          <div class="form-group-card-dark">
            <div class="avatar-row-dark">
              <label>Avatar</label>
              <div class="avatar-circle-dark">${(this.settings.userName || 'S').charAt(0).toUpperCase()}</div>
            </div>

            <div class="form-field-dark">
              <label>Full name</label>
              <input type="text" id="settingUserName" value="${this.settings.userName}" placeholder="Sumit" />
            </div>

            <div class="form-field-dark">
              <label>What best describes your work?</label>
              <select id="settingUserRole">
                <option value="Software Engineer" ${this.settings.userRole === 'Software Engineer' ? 'selected' : ''}>Software Engineering</option>
                <option value="AI/ML Engineer" ${this.settings.userRole === 'AI/ML Engineer' ? 'selected' : ''}>AI / ML Engineer</option>
                <option value="DevOps" ${this.settings.userRole === 'DevOps' ? 'selected' : ''}>DevOps & Systems</option>
                <option value="Interviewer" ${this.settings.userRole === 'Interviewer' ? 'selected' : ''}>Technical Interviewer</option>
              </select>
            </div>

            <div class="form-field-dark">
              <label>🎨 Application Theme & Visual Style</label>
              <select id="settingAppTheme" onchange="window.settingsComponentInstance?.handleThemePreview(this.value)">
                <option value="system" ${this.settings.appTheme === 'system' ? 'selected' : ''}>💻 System Default (Match OS Preference)</option>
                <option value="dark-glass" ${this.settings.appTheme === 'dark-glass' ? 'selected' : ''}>🌌 Dark Glassmorphism (Default Cyber Slate)</option>
                <option value="light-glass" ${this.settings.appTheme === 'light-glass' ? 'selected' : ''}>❄️ Light Glassmorphism (Frosted Snow)</option>
                <option value="dark" ${this.settings.appTheme === 'dark' ? 'selected' : ''}>🌙 Solid Dark Mode (High Contrast Obsidian)</option>
                <option value="light" ${this.settings.appTheme === 'light' ? 'selected' : ''}>☀️ Professional Light Mode (Clean Studio)</option>
              </select>
            </div>
          </div>
        `;

      case 'signaling':
        return `
          <h2 class="tab-title-dark">⚡ Signaling & P2P Media Connection</h2>
          
          <div class="form-group-card-dark">
            <div class="form-field-dark">
              <label>P2P Signaling Cascade Provider</label>
              <select id="settingSignalingMethod">
                <option value="auto" ${this.settings.signalingMethod === 'auto' ? 'selected' : ''}>⚡ Auto Priority Cascade (Firebase > WS > WebTorrent > IPC > Memory)</option>
                <option value="firebase" ${this.settings.signalingMethod === 'firebase' ? 'selected' : ''}>🔥 Firebase Realtime Database (HTTPS Port 443)</option>
                <option value="websocket" ${this.settings.signalingMethod === 'websocket' ? 'selected' : ''}>🌐 Custom WebSocket Server (WSS Port 443)</option>
                <option value="webtorrent" ${this.settings.signalingMethod === 'webtorrent' ? 'selected' : ''}>🌀 WebTorrent Tracker Mesh</option>
                <option value="ipc" ${this.settings.signalingMethod === 'ipc' ? 'selected' : ''}>💻 Electron IPC (Local Machine Loopback)</option>
                <option value="memory" ${this.settings.signalingMethod === 'memory' ? 'selected' : ''}>🧠 Memory Safety Net</option>
              </select>
              <p class="field-hint-dark">Controls how session handshake codes (e.g. a7k9-x2p4) are negotiated between peers.</p>
            </div>
          </div>
        `;

      case 'speech':
        return `
          <h2 class="tab-title-dark">🎙️ Speech-to-Text (Whisper STT)</h2>
          
          <div class="form-group-card-dark">
            <div class="form-field-dark">
              <label>Speech-to-Text Engine Provider</label>
              <select id="settingWhisperProvider">
                <option value="local" ${this.settings.whisperProvider === 'local' ? 'selected' : ''}>Native whisper.cpp C++ Binary (Offline Local GGML Model)</option>
                <option value="openai" ${this.settings.whisperProvider === 'openai' ? 'selected' : ''}>Cloud OpenAI Audio Whisper REST API</option>
              </select>
            </div>

            <div class="form-field-dark">
              <label>Local Whisper Model Architecture</label>
              <select id="settingWhisperModel">
                <option value="tiny" ${this.settings.localWhisperModel === 'tiny' ? 'selected' : ''}>Tiny (${WHISPER_MODELS.tiny.sizeLabel} — Fast ~2ms, Minimal RAM)</option>
                <option value="base" ${this.settings.localWhisperModel === 'base' ? 'selected' : ''}>Base (${WHISPER_MODELS.base.sizeLabel} — Balanced Speed & Accuracy)</option>
                <option value="small" ${this.settings.localWhisperModel === 'small' ? 'selected' : ''}>Small (${WHISPER_MODELS.small.sizeLabel} — High Accuracy STT)</option>
                <option value="medium" ${this.settings.localWhisperModel === 'medium' ? 'selected' : ''}>Medium (${WHISPER_MODELS.medium.sizeLabel} — Production Grade Accuracy)</option>
                <option value="large" ${this.settings.localWhisperModel === 'large' ? 'selected' : ''}>Large v3 (${WHISPER_MODELS.large.sizeLabel} — Maximum Accuracy & Multilingual)</option>
              </select>
              <p class="field-hint-dark">If the selected model is not present locally, it will automatically download with a live progress bar.</p>
            </div>

            <div class="checkbox-row-dark" style="margin-top: 12px; margin-bottom: 16px;">
              <input type="checkbox" id="settingWhisperMultilingual" ${this.settings.whisperMultilingual !== false ? 'checked' : ''} />
              <div>
                <strong>Enable Multilingual Support (99+ Languages)</strong>
                <p class="field-hint-dark">Uses multilingual model files (.bin) to transcribe non-English or mixed languages.</p>
              </div>
            </div>

            <div class="form-field-dark">
              <label>Target Spoken Language</label>
              <select id="settingWhisperLanguage">
                ${SUPPORTED_LANGUAGES.map((lang) => `
                  <option value="${lang.code}" ${this.settings.whisperLanguage === lang.code ? 'selected' : ''}>
                    ${lang.name}
                  </option>
                `).join('')}
              </select>
              <p class="field-hint-dark">Language passed to Whisper engine (Auto-detect automatically identifies spoken language).</p>
            </div>

            <div class="form-field-dark">
              <label>CPU Threads Allocation</label>
              <input type="number" id="settingWhisperThreads" value="${this.settings.whisperThreads}" min="1" max="16" />
            </div>

            <div class="form-field-dark">
              <label>OpenAI API Key (for Cloud Whisper API fallback)</label>
              <input type="password" id="settingOpenAiKey" value="${this.settings.openAiApiKey}" placeholder="sk-..." />
            </div>
          </div>
        `;

      case 'copilot':
        return `
          <h2 class="tab-title-dark">🤖 AI Copilot LLM Engine</h2>
          
          <div class="form-group-card-dark">
            <div class="form-field-dark">
              <label>AI Model Provider</label>
              <select id="settingLlmProvider">
                <option value="openai" ${this.settings.llmProvider === 'openai' ? 'selected' : ''}>OpenAI REST API</option>
                <option value="ollama" ${this.settings.llmProvider === 'ollama' ? 'selected' : ''}>Ollama Local LLM Server</option>
                <option value="claude-cli" ${this.settings.llmProvider === 'claude-cli' ? 'selected' : ''}>Claude System CLI</option>
              </select>
            </div>

            <div class="form-field-dark">
              <label>OpenAI Model Name</label>
              <input type="text" id="settingOpenAiModel" value="${this.settings.openAiModel}" placeholder="gpt-4o-mini" />
            </div>

            <div class="form-field-dark">
              <label>Ollama Base URL</label>
              <input type="text" id="settingOllamaUrl" value="${this.settings.ollamaBaseUrl}" placeholder="http://localhost:11434" />
            </div>

            <div class="form-field-dark">
              <label>Ollama Model</label>
              <input type="text" id="settingOllamaModel" value="${this.settings.ollamaModel}" placeholder="llama3.2" />
            </div>

            <div class="form-field-dark">
              <label>Instructions for AI Copilot</label>
              <textarea id="settingSystemPrompt" rows="4" placeholder="Instructions for AI Copilot...">${this.settings.systemPromptInstructions}</textarea>
            </div>
          </div>
        `;

      case 'privacy':
        return `
          <h2 class="tab-title-dark">🛡️ Privacy, Safety & Panel Controls</h2>
          
          <div class="form-group-card-dark">
            <div class="checkbox-row-dark">
              <input type="checkbox" id="settingEnableHosting" ${this.settings.enableHosting !== false ? 'checked' : ''} onchange="window.settingsComponentInstance?.handleSettingChange('enableHosting', this.checked)" />
              <div>
                <strong>Enable Screen Share Hosting / Streaming</strong>
                <p class="field-hint-dark">Allows your device to host screen sharing sessions. If disabled, hosting card is hidden and app defaults to Join & AI Helper mode.</p>
              </div>
            </div>

            <div class="checkbox-row-dark">
              <input type="checkbox" id="settingAutoOpenChat" ${this.settings.autoOpenChatPanel !== false ? 'checked' : ''} />
              <div>
                <strong>Auto-enable Side Chat & AI Copilot Drawer</strong>
                <p class="field-hint-dark">Automatically opens the Chat, Files, and AI Copilot side-drawer on session launch.</p>
              </div>
            </div>

            <div class="checkbox-row-dark">
              <input type="checkbox" id="settingDualPanels" ${this.settings.enableDualSharingJoinPanels !== false ? 'checked' : ''} />
              <div>
                <strong>Enable Share & Join Remote Panels Side-by-Side</strong>
                <p class="field-hint-dark">Displays both Screen Sharing and Remote Session Joining cards simultaneously.</p>
              </div>
            </div>

            <div class="checkbox-row-dark">
              <input type="checkbox" id="settingAutoCapture" ${this.settings.autoCaptureOnQuestion ? 'checked' : ''} />
              <div>
                <strong>Auto-capture screen on coding question</strong>
                <p class="field-hint-dark">Automatically snapshot screen context when an interview question is detected.</p>
              </div>
            </div>

            <div class="checkbox-row-dark">
              <input type="checkbox" id="settingRequireApproval" ${this.settings.requireApprovalForOsTools ? 'checked' : ''} />
              <div>
                <strong>Require explicit approval card for OS tools</strong>
                <p class="field-hint-dark">Shows inline [Approve] / [Dismiss] prompt card before capturing screen or reading clipboard.</p>
              </div>
            </div>
          </div>
        `;


      case 'skills':
        return `
          <h2 class="tab-title-dark">🧰 Registered MCP Skills & Tools</h2>
          <div class="form-group-card-dark">
            <div class="skills-list">
              <div class="skill-pill-dark">📷 capture_screen (OS)</div>
              <div class="skill-pill-dark">🖼️ capture_window (OS)</div>
              <div class="skill-pill-dark">📋 clipboard_read (OS)</div>
              <div class="skill-pill-dark">📝 clipboard_write (OS)</div>
              <div class="skill-pill-dark">💬 send_chat (Local)</div>
              <div class="skill-pill-dark">📊 get_system_status (Local)</div>
              <div class="skill-pill-dark">📝 summarize_session (Local)</div>
            </div>
          </div>
        `;

      case 'connectors':
        return `
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <h2 class="tab-title-dark" style="margin: 0;">🔌 Connectors & Integrations</h2>
            <button 
              onclick="window.settingsComponentInstance?.toggleAddMcpServerForm(true)"
              style="background: #6366f1; color: white; border: none; padding: 6px 12px; border-radius: 6px; font-weight: 600; font-size: 0.8rem; cursor: pointer; display: flex; align-items: center; gap: 4px;"
            >
              ➕ Add MCP Server
            </button>
          </div>

          <!-- Telegram Channel AI Broadcast Relay Card -->
          <div class="form-group-card-dark" style="margin-bottom: 16px; border: 1px solid rgba(59, 130, 246, 0.3); background: rgba(15, 23, 42, 0.75);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
              <h3 style="margin: 0; font-size: 0.95rem; color: #60a5fa; display: flex; align-items: center; gap: 8px;">
                ✈️ Telegram Channel AI Broadcast Relay
              </h3>
              <label class="switch">
                <input type="checkbox" id="settingEnableTelegramRelay" ${this.settings.enableTelegramRelay ? 'checked' : ''} />
                <span class="slider"></span>
              </label>
            </div>
            
            <p style="color: #94a3b8; font-size: 0.8rem; margin-top: 0; margin-bottom: 14px;">
              Automatically broadcast live AI Copilot answers directly to your Telegram channel or chat via Official Telegram Bot API.
            </p>

            <div class="form-field-dark">
              <label>Telegram Bot Token</label>
              <input type="password" id="settingTelegramBotToken" value="${this.settings.telegramBotToken || ''}" placeholder="e.g. 123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ" />
              <small style="color: #64748b; font-size: 0.73rem;">Obtain from @BotFather on Telegram</small>
            </div>

            <div class="form-field-dark">
              <label>Target Channel or Chat ID</label>
              <input type="text" id="settingTelegramChatId" value="${this.settings.telegramChatId || ''}" placeholder="e.g. @my_channel_name or -100123456789" />
              <small style="color: #64748b; font-size: 0.73rem;">e.g. @your_channel or numeric Chat ID</small>
            </div>

            <div style="display: flex; justify-content: flex-end; margin-top: 10px;">
              <button 
                onclick="window.settingsComponentInstance?.testTelegramRelay()"
                style="background: rgba(59, 130, 246, 0.2); border: 1px solid rgba(59, 130, 246, 0.4); color: #93c5fd; padding: 6px 14px; border-radius: 6px; font-weight: 600; font-size: 0.8rem; cursor: pointer; display: flex; align-items: center; gap: 6px;"
              >
                🧪 Send Test Message to Telegram
              </button>
            </div>
          </div>
          
          ${this.isAddingMcpServer ? `
            <div class="form-group-card-dark" style="margin-bottom: 16px; border: 1px solid rgba(99, 102, 241, 0.4); background: rgba(30, 41, 59, 0.8);">
              <h3 style="margin-top: 0; margin-bottom: 12px; font-size: 0.95rem; color: #818cf8;">➕ Register New Model Context Protocol (MCP) Server</h3>
              
              <div class="form-field-dark">
                <label>Server Name</label>
                <input type="text" id="newMcpName" placeholder="e.g. Antigravity MCP Agent" />
              </div>

              <div class="form-field-dark">
                <label>Transport Type</label>
                <select id="newMcpType">
                  <option value="sse">SSE (Server-Sent Events / HTTP WebSockets)</option>
                  <option value="stdio">stdio (Standard I/O CLI Command)</option>
                  <option value="in_memory">IN_MEMORY (Embedded App Tool)</option>
                </select>
              </div>

              <div class="form-field-dark">
                <label>Endpoint URL or Command</label>
                <input type="text" id="newMcpUrlOrCmd" placeholder="e.g. http://localhost:3000/sse or npx -y @modelcontextprotocol/server-everything" />
              </div>

              <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 14px;">
                <button 
                  onclick="window.settingsComponentInstance?.toggleAddMcpServerForm(false)"
                  style="background: rgba(148, 163, 184, 0.2); border: 1px solid rgba(255,255,255,0.1); color: #cbd5e1; padding: 6px 12px; border-radius: 6px; font-size: 0.8rem; cursor: pointer;"
                >
                  Cancel
                </button>
                <button 
                  onclick="window.settingsComponentInstance?.addCustomMcpServer()"
                  style="background: #10b981; color: white; border: none; padding: 6px 14px; border-radius: 6px; font-weight: 600; font-size: 0.8rem; cursor: pointer;"
                >
                  Save MCP Server
                </button>
              </div>
            </div>
          ` : ''}

          <div class="form-group-card-dark">
            <div class="mcp-servers-list">
              ${(this.settings.mcpServers || []).map((srv) => `
                <div class="mcp-server-item-dark" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; margin-bottom: 8px; background: rgba(15, 23, 42, 0.6); border-radius: 8px; border: 1px solid rgba(255,255,255,0.06);">
                  <div class="mcp-server-info" style="flex: 1;">
                    <strong class="mcp-server-name" style="color: #f8fafc; font-size: 0.88rem; display: block;">${srv.name}</strong>
                    <span class="mcp-server-type" style="color: #94a3b8; font-size: 0.76rem;">Type: ${srv.type.toUpperCase()} ${srv.url ? `(${srv.url})` : srv.command ? `(${srv.command})` : ''}</span>
                  </div>
                  <div style="display: flex; align-items: center; gap: 12px;">
                    <label class="switch">
                      <input type="checkbox" ${srv.enabled ? 'checked' : ''} onchange="window.settingsComponentInstance?.toggleMcpServer('${srv.id}')" />
                      <span class="slider"></span>
                    </label>
                    ${srv.id !== 'default_builtin' ? `
                      <button 
                        onclick="window.settingsComponentInstance?.deleteMcpServer('${srv.id}')"
                        style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); color: #f87171; border-radius: 4px; padding: 4px 8px; font-size: 0.72rem; cursor: pointer;"
                        title="Delete MCP Server"
                      >
                        🗑️
                      </button>
                    ` : ''}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `;

      case 'plugins':
        return `
          <h2 class="tab-title-dark">🧩 Plugin Sandbox</h2>
          
          <div class="form-group-card-dark">
            <div class="mcp-server-item-dark">
              <div class="mcp-server-info">
                <strong class="mcp-server-name">Interview Live Auto-Summary Plugin</strong>
                <span class="mcp-server-type">Status: Active inside Node.js vm Sandbox</span>
              </div>
              <label class="switch">
                <input type="checkbox" checked />
                <span class="slider"></span>
              </label>
            </div>
          </div>
        `;
    }
  }

  private isAddingMcpServer: boolean = false;

  public toggleAddMcpServerForm(show: boolean): void {
    this.isAddingMcpServer = show;
    this.render();
  }

  public addCustomMcpServer(): void {
    const nameEl = document.getElementById('newMcpName') as HTMLInputElement;
    const typeEl = document.getElementById('newMcpType') as HTMLSelectElement;
    const urlOrCmdEl = document.getElementById('newMcpUrlOrCmd') as HTMLInputElement;

    const name = nameEl?.value?.trim() || 'Custom MCP Server';
    const type = (typeEl?.value || 'sse') as 'in_memory' | 'sse' | 'stdio';
    const urlOrCmd = urlOrCmdEl?.value?.trim() || '';

    const newServer = {
      id: `mcp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name,
      type,
      url: type === 'sse' ? urlOrCmd : undefined,
      command: type === 'stdio' ? urlOrCmd : undefined,
      enabled: true,
    };

    if (!this.settings.mcpServers) {
      this.settings.mcpServers = [];
    }

    this.settings.mcpServers.push(newServer);
    this.isAddingMcpServer = false;
    this.render();
  }

  public deleteMcpServer(serverId: string): void {
    this.settings.mcpServers = (this.settings.mcpServers || []).filter((s) => s.id !== serverId);
    this.render();
  }

  public handleThemePreview(theme: any): void {
    themeManager.applyTheme(theme);
  }

  public handleSettingChange(key: string, value: any): void {
    (this.settings as any)[key] = value;
    if (key === 'enableHosting') {
      useAppStore.getState().setEnableHosting(value);
    }
    if (typeof window !== 'undefined' && (window as any).electronAPI?.saveSettings) {
      (window as any).electronAPI.saveSettings(this.settings).catch(console.error);
    }
  }

  public toggleMcpServer(serverId: string): void {
    const srv = (this.settings.mcpServers || []).find((s) => s.id === serverId);
    if (srv) {
      srv.enabled = !srv.enabled;
    }
  }

  public async testTelegramRelay(): Promise<void> {
    const tokenEl = document.getElementById('settingTelegramBotToken') as HTMLInputElement | null;
    const chatIdEl = document.getElementById('settingTelegramChatId') as HTMLInputElement | null;

    const token = tokenEl ? tokenEl.value.trim() : this.settings.telegramBotToken;
    const chatId = chatIdEl ? chatIdEl.value.trim() : this.settings.telegramChatId;

    if (!token || !chatId) {
      alert('⚠️ Please enter both Telegram Bot Token and Chat ID before testing.');
      return;
    }

    telegramRelayService.updateConfig({ enabled: true, botToken: token, chatId });
    const res = await telegramRelayService.sendTelegramMessage(
      '🚀 **P2P Live AI Copilot Test Connection**: Telegram AI Broadcast Relay is active and connected successfully!',
      'P2P Live AI Copilot'
    );

    if (res.success) {
      alert('✅ Test message sent successfully! Check your Telegram channel/chat.');
    } else {
      alert(`❌ Telegram Test Failed: ${res.error}`);
    }
  }
}

