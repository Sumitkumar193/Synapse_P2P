export interface MCPServerConfig {
  id: string;
  name: string;
  type: 'in_memory' | 'sse' | 'stdio';
  url?: string;
  command?: string;
  args?: string[];
  enabled: boolean;
}

export type AppThemeMode = 'system' | 'dark-glass' | 'light-glass' | 'dark' | 'light';

export interface AppSettings {
  // General & User Profile
  userName: string;
  userRole: string;
  appTheme: AppThemeMode;

  // Signaling & P2P Media
  signalingMethod: 'auto' | 'firebase' | 'websocket' | 'webtorrent' | 'ipc' | 'memory';

  // STT Settings
  whisperProvider: 'local' | 'openai';
  localWhisperModel: 'tiny' | 'base' | 'small' | 'medium' | 'large';
  whisperThreads: number;
  openAiApiKey: string;

  // AI LLM Engine Settings
  llmProvider: 'openai' | 'claude-cli' | 'ollama';
  openAiModel: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
  claudeCommand: string;
  systemPromptInstructions: string;

  // Workflow & Safety Controls
  autoCaptureOnQuestion: boolean;
  autoApprovalForLocalTools: boolean;
  requireApprovalForOsTools: boolean;
  autoOpenChatPanel: boolean;
  enableDualSharingJoinPanels: boolean;

  // MCP Servers Configuration
  mcpServers: MCPServerConfig[];
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  userName: 'Sumit',
  userRole: 'Software Engineer',
  appTheme: 'dark-glass',

  signalingMethod: 'auto',

  whisperProvider: 'local',
  localWhisperModel: 'tiny',
  whisperThreads: 4,
  openAiApiKey: '',

  llmProvider: 'openai',
  openAiModel: 'gpt-4o-mini',
  ollamaBaseUrl: 'http://localhost:11434',
  ollamaModel: 'llama3.2',
  claudeCommand: 'claude',
  systemPromptInstructions: 'Always analyze technical interview questions systematically.',

  autoCaptureOnQuestion: true,
  autoApprovalForLocalTools: true,
  requireApprovalForOsTools: true,
  autoOpenChatPanel: true,
  enableDualSharingJoinPanels: true,

  mcpServers: [
    {
      id: 'server_in_memory_default',
      name: 'Default Built-in Tools Server',
      type: 'in_memory',
      enabled: true,
    },
    {
      id: 'server_local_ollama_mcp',
      name: 'Local Ollama MCP Bridge',
      type: 'sse',
      url: 'http://localhost:11434/mcp',
      enabled: false,
    },
  ],
};
