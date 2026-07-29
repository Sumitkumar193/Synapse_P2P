import { create } from 'zustand';
import { DesktopSource } from '../../sdk';

export type SignalingMethod = 'auto' | 'firebase' | 'websocket' | 'webtorrent' | 'ipc' | 'memory';

export interface ModalConfig {
  isOpen: boolean;
  title?: string;
  message: string;
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
  resetSessionState: () => void;
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
  resetSessionState: () =>
    set({
      isHosting: false,
      isViewing: false,
      sessionCode: null,
      remoteStream: null,
      localStream: null,
      statusState: 'ready',
      statusText: 'Ready',
    }),
}));
