import { create } from 'zustand';
import { DesktopSource } from '../../sdk';

export type SignalingMethod = 'auto' | 'firebase' | 'websocket' | 'webtorrent' | 'ipc' | 'memory';

export interface ModalConfig {
  isOpen: boolean;
  title?: string;
  message: string;
}

export interface ClipboardModalConfig {
  isOpen: boolean;
  text: string;
}

export interface ChatMessage {
  id: string;
  sender: 'local' | 'remote';
  kind: 'text' | 'file' | 'clipboard';
  text?: string;
  fileData?: {
    name: string;
    size: number;
    url?: string;
    progress?: number;
    isIncoming: boolean;
  };
  clipboardData?: {
    text: string;
  };
  timestamp: number;
}

export interface AppState {
  activeTab: 'share' | 'join';
  sources: DesktopSource[];
  selectedSourceId: string;
  signalingMethod: SignalingMethod;
  signalingHealth: Record<string, boolean>;
  isHosting: boolean;
  isViewing: boolean;
  sessionCode: string | null;
  statusState: 'ready' | 'hosting' | 'connected' | 'expired';
  statusText: string;
  remainingSeconds: number;
  isExpired: boolean;
  remoteStream: MediaStream | null;
  localStream: MediaStream | null;
  modalConfig: ModalConfig;
  clipboardModalConfig: ClipboardModalConfig;

  // Real-time Chat & Media Panel State
  isSidePanelOpen: boolean;
  chatMessages: ChatMessage[];
  clipboardText: string;

  // Actions
  setActiveTab: (tab: 'share' | 'join') => void;
  setSources: (sources: DesktopSource[]) => void;
  setSelectedSourceId: (id: string) => void;
  setSignalingMethod: (method: SignalingMethod) => void;
  setSignalingHealth: (health: Record<string, boolean>) => void;
  setIsHosting: (isHosting: boolean) => void;
  setIsViewing: (isViewing: boolean) => void;
  setSessionCode: (code: string | null) => void;
  setStatusState: (state: 'ready' | 'hosting' | 'connected' | 'expired') => void;
  setStatusText: (text: string) => void;
  setRemainingSeconds: (sec: number | ((prev: number) => number)) => void;
  setIsExpired: (expired: boolean) => void;
  setRemoteStream: (stream: MediaStream | null) => void;
  setLocalStream: (stream: MediaStream | null) => void;
  showNotice: (message: string, title?: string) => void;
  closeModal: () => void;
  showClipboardModal: (text: string) => void;
  closeClipboardModal: () => void;
  resetSessionState: () => void;

  // Chat Actions
  setIsSidePanelOpen: (open: boolean) => void;
  addChatMessage: (msg: ChatMessage) => void;
  updateFileMessageProgress: (id: string, progress: number) => void;
  setClipboardText: (text: string) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  activeTab: 'share',
  sources: [],
  selectedSourceId: 'screen:0:0',
  signalingMethod: 'auto',
  signalingHealth: {
    firebase: true,
    websocket: false,
    webtorrent: true,
    ipc: true,
    memory: true,
  },
  isHosting: false,
  isViewing: false,
  sessionCode: null,
  statusState: 'ready',
  statusText: 'Ready',
  remainingSeconds: 120,
  isExpired: false,
  remoteStream: null,
  localStream: null,
  modalConfig: { isOpen: false, title: 'Notice', message: '' },
  clipboardModalConfig: { isOpen: false, text: '' },

  isSidePanelOpen: false,
  chatMessages: [],
  clipboardText: '',

  setActiveTab: (activeTab) => set({ activeTab }),
  setSources: (sources) => set({ sources }),
  setSelectedSourceId: (selectedSourceId) => set({ selectedSourceId }),
  setSignalingMethod: (signalingMethod) => set({ signalingMethod }),
  setSignalingHealth: (signalingHealth) => set({ signalingHealth }),
  setIsHosting: (isHosting) => set({ isHosting }),
  setIsViewing: (isViewing) => set({ isViewing }),
  setSessionCode: (sessionCode) => set({ sessionCode }),
  setStatusState: (statusState) => set({ statusState }),
  setStatusText: (statusText) => set({ statusText }),
  setRemainingSeconds: (sec) =>
    set((state) => ({
      remainingSeconds: typeof sec === 'function' ? sec(state.remainingSeconds) : sec,
    })),
  setIsExpired: (isExpired) => set({ isExpired }),
  setRemoteStream: (remoteStream) => set({ remoteStream }),
  setLocalStream: (localStream) => set({ localStream }),
  showNotice: (message, title = 'Notice') =>
    set({ modalConfig: { isOpen: true, title, message } }),
  closeModal: () => set((state) => ({ modalConfig: { ...state.modalConfig, isOpen: false } })),
  showClipboardModal: (text) => set({ clipboardModalConfig: { isOpen: true, text } }),
  closeClipboardModal: () => set({ clipboardModalConfig: { isOpen: false, text: '' } }),
  resetSessionState: () =>
    set({
      isHosting: false,
      isViewing: false,
      sessionCode: null,
      remoteStream: null,
      localStream: null,
      statusState: 'ready',
      statusText: 'Ready',
      isSidePanelOpen: false,
      chatMessages: [],
      clipboardText: '',
      clipboardModalConfig: { isOpen: false, text: '' },
    }),

  setIsSidePanelOpen: (isSidePanelOpen) => set({ isSidePanelOpen }),
  addChatMessage: (msg) => set((state) => ({ chatMessages: [...state.chatMessages, msg] })),
  updateFileMessageProgress: (id, progress) =>
    set((state) => ({
      chatMessages: state.chatMessages.map((msg) =>
        msg.id === id && msg.fileData
          ? { ...msg, fileData: { ...msg.fileData, progress } }
          : msg
      ),
    })),
  setClipboardText: (clipboardText) => set({ clipboardText }),
}));
