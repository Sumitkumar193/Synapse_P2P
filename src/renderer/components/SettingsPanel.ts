import { AppSettings, DEFAULT_APP_SETTINGS, AppThemeMode } from '../../shared/settings';
import { themeManager } from '../utils/themeManager';

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
          themeManager.applyTheme(this.settings.appTheme || 'dark-glass');
        }
      } catch {}
    }
  }

  public async saveSettings(): Promise<void> {
    if (!this.containerEl) return;

    // Read active form inputs
    const userName = (this.containerEl.querySelector('#settingUserName') as HTMLInputElement)?.value || this.settings.userName;
    const userRole = (this.containerEl.querySelector('#settingUserRole') as HTMLSelectElement)?.value || this.settings.userRole;
    const appTheme = (this.containerEl.querySelector('#settingAppTheme') as HTMLSelectElement)?.value as AppThemeMode || this.settings.appTheme || 'dark-glass';
    const signalingMethod = (this.containerEl.querySelector('#settingSignalingMethod') as HTMLSelectElement)?.value as any || this.settings.signalingMethod;

    const whisperProvider = (this.containerEl.querySelector('#settingWhisperProvider') as HTMLSelectElement)?.value as any || this.settings.whisperProvider;
    const localWhisperModel = (this.containerEl.querySelector('#settingWhisperModel') as HTMLSelectElement)?.value as any || this.settings.localWhisperModel;
    const whisperThreads = parseInt((this.containerEl.querySelector('#settingWhisperThreads') as HTMLInputElement)?.value || '4', 10);
    const openAiApiKey = (this.containerEl.querySelector('#settingOpenAiKey') as HTMLInputElement)?.value ?? this.settings.openAiApiKey;

    const llmProvider = (this.containerEl.querySelector('#settingLlmProvider') as HTMLSelectElement)?.value as any || this.settings.llmProvider;
    const openAiModel = (this.containerEl.querySelector('#settingOpenAiModel') as HTMLInputElement)?.value || this.settings.openAiModel;
    const ollamaBaseUrl = (this.containerEl.querySelector('#settingOllamaUrl') as HTMLInputElement)?.value || this.settings.ollamaBaseUrl;
    const ollamaModel = (this.containerEl.querySelector('#settingOllamaModel') as HTMLInputElement)?.value || this.settings.ollamaModel;
    const systemPromptInstructions = (this.containerEl.querySelector('#settingSystemPrompt') as HTMLTextAreaElement)?.value || this.settings.systemPromptInstructions;

    const autoCaptureOnQuestion = (this.containerEl.querySelector('#settingAutoCapture') as HTMLInputElement)?.checked ?? this.settings.autoCaptureOnQuestion;
    const requireApprovalForOsTools = (this.containerEl.querySelector('#settingRequireApproval') as HTMLInputElement)?.checked ?? this.settings.requireApprovalForOsTools;

    this.settings = {
      ...this.settings,
      userName,
      userRole,
      appTheme,
      signalingMethod,
      whisperProvider,
      localWhisperModel,
      whisperThreads,
      openAiApiKey,
      llmProvider,
      openAiModel,
      ollamaBaseUrl,
      ollamaModel,
      systemPromptInstructions,
      autoCaptureOnQuestion,
      requireApprovalForOsTools,
    };

    themeManager.applyTheme(appTheme);

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
              <label>Speech-to-Text Provider</label>
              <select id="settingWhisperProvider">
                <option value="local" ${this.settings.whisperProvider === 'local' ? 'selected' : ''}>Native whisper.cpp C++ Binary (Offline Local Model)</option>
                <option value="openai" ${this.settings.whisperProvider === 'openai' ? 'selected' : ''}>Cloud OpenAI Audio Whisper REST API</option>
              </select>
            </div>

            <div class="form-field-dark">
              <label>Local Model Architecture</label>
              <select id="settingWhisperModel">
                <option value="tiny" ${this.settings.localWhisperModel === 'tiny' ? 'selected' : ''}>ggml-tiny.en.bin (39 MB — ~2ms latency)</option>
                <option value="base" ${this.settings.localWhisperModel === 'base' ? 'selected' : ''}>ggml-base.en.bin (74 MB — Balanced)</option>
                <option value="small" ${this.settings.localWhisperModel === 'small' ? 'selected' : ''}>ggml-small.en.bin (244 MB — High Accuracy)</option>
              </select>
            </div>

            <div class="form-field-dark">
              <label>CPU Threads Allocation</label>
              <input type="number" id="settingWhisperThreads" value="${this.settings.whisperThreads}" min="1" max="16" />
            </div>

            <div class="form-field-dark">
              <label>OpenAI API Key (for Cloud Whisper & OpenAI LLM)</label>
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
          <h2 class="tab-title-dark">🛡️ Privacy & Safety Controls</h2>
          
          <div class="form-group-card-dark">
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
          <h2 class="tab-title-dark">🔌 Connectors & MCP Servers</h2>
          
          <div class="form-group-card-dark">
            <div class="mcp-servers-list">
              ${(this.settings.mcpServers || []).map((srv) => `
                <div class="mcp-server-item-dark">
                  <div class="mcp-server-info">
                    <strong class="mcp-server-name">${srv.name}</strong>
                    <span class="mcp-server-type">Type: ${srv.type.toUpperCase()} ${srv.url ? `(${srv.url})` : ''}</span>
                  </div>
                  <label class="switch">
                    <input type="checkbox" ${srv.enabled ? 'checked' : ''} onchange="window.settingsComponentInstance?.toggleMcpServer('${srv.id}')" />
                    <span class="slider"></span>
                  </label>
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

  public handleThemePreview(theme: any): void {
    themeManager.applyTheme(theme);
  }

  public toggleMcpServer(serverId: string): void {
    const srv = (this.settings.mcpServers || []).find((s) => s.id === serverId);
    if (srv) {
      srv.enabled = !srv.enabled;
    }
  }
}
