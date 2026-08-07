export interface MCPToolDefinition {
  name: string;
  description: string;
  category: 'local' | 'ipc_proxied';
  requiresApproval: boolean;
  inputSchema: Record<string, any>;
}

export const MCP_TOOL_DEFINITIONS: Record<string, MCPToolDefinition> = {
  // Category A: Worker-Local Tools
  send_chat: {
    name: 'send_chat',
    description: 'Send a chat message to the room participants.',
    category: 'local',
    requiresApproval: false,
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Message text content to send' },
      },
      required: ['text'],
    },
  },
  chat_history: {
    name: 'chat_history',
    description: 'Get recent chat messages from the session history.',
    category: 'local',
    requiresApproval: false,
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Maximum number of recent messages to return' },
      },
    },
  },
  participants: {
    name: 'participants',
    description: 'Get list of active participants in the current P2P session.',
    category: 'local',
    requiresApproval: false,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  session_stats: {
    name: 'session_stats',
    description: 'Get real-time WebRTC telemetry connection metrics (RTT, bitrate, FPS, candidate type).',
    category: 'local',
    requiresApproval: false,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  connect_room: {
    name: 'connect_room',
    description: 'Connect to a session room using an 8-character code.',
    category: 'local',
    requiresApproval: false,
    inputSchema: {
      type: 'object',
      properties: {
        roomCode: { type: 'string', description: '8-character session code (e.g. a7k9-x2p4)' },
        isHost: { type: 'boolean', description: 'Whether to connect as host' },
      },
      required: ['roomCode'],
    },
  },
  disconnect: {
    name: 'disconnect',
    description: 'Disconnect from the active P2P session.',
    category: 'local',
    requiresApproval: false,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // Category B: Main-Process IPC Proxied OS Tools
  capture_screen: {
    name: 'capture_screen',
    description: 'Capture a desktop screenshot of the current primary display.',
    category: 'ipc_proxied',
    requiresApproval: false,
    inputSchema: {
      type: 'object',
      properties: {
        format: { type: 'string', enum: ['jpeg', 'png'], default: 'jpeg' },
        quality: { type: 'number', description: 'JPEG quality (1-100)', default: 80 },
      },
    },
  },
  capture_window: {
    name: 'capture_window',
    description: 'Capture a screenshot of a specific target window.',
    category: 'ipc_proxied',
    requiresApproval: false,
    inputSchema: {
      type: 'object',
      properties: {
        windowId: { type: 'string', description: 'Target window source ID' },
        format: { type: 'string', enum: ['jpeg', 'png'], default: 'jpeg' },
        quality: { type: 'number', description: 'JPEG quality (1-100)', default: 80 },
      },
      required: ['windowId'],
    },
  },
  clipboard_read: {
    name: 'clipboard_read',
    description: 'Read current text content from the host OS clipboard.',
    category: 'ipc_proxied',
    requiresApproval: false,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  clipboard_write: {
    name: 'clipboard_write',
    description: 'Write text content to the host OS clipboard.',
    category: 'ipc_proxied',
    requiresApproval: true,
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to copy to clipboard' },
      },
      required: ['text'],
    },
  },
  recording_start: {
    name: 'recording_start',
    description: 'Start recording session video/audio stream to local file.',
    category: 'ipc_proxied',
    requiresApproval: true,
    inputSchema: {
      type: 'object',
      properties: {
        outputFormat: { type: 'string', default: 'webm' },
      },
    },
  },
  recording_stop: {
    name: 'recording_stop',
    description: 'Stop current session recording.',
    category: 'ipc_proxied',
    requiresApproval: true,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  read_active_window: {
    name: 'read_active_window',
    description: 'Get details (title, process name, PID, bounds) of the current foreground OS window.',
    category: 'ipc_proxied',
    requiresApproval: false,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  inject_keystrokes: {
    name: 'inject_keystrokes',
    description: 'Inject keyboard strokes into the currently active host window.',
    category: 'ipc_proxied',
    requiresApproval: true,
    inputSchema: {
      type: 'object',
      properties: {
        keys: { type: 'string', description: 'Text or keys sequence to type' },
      },
      required: ['keys'],
    },
  },
  execute_script: {
    name: 'execute_script',
    description: 'Execute a shell command or script on the host operating system.',
    category: 'ipc_proxied',
    requiresApproval: true,
    inputSchema: {
      type: 'object',
      properties: {
        script: { type: 'string', description: 'Shell command or script string to execute' },
      },
      required: ['script'],
    },
  },
};
