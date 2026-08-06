import { create } from 'zustand';
import { DesktopSource } from '../../sdk';

export type SignalingMethod = 'auto' | 'firebase' | 'websocket' | 'webtorrent' | 'ipc' | 'memory';

/**
 * Merges newText into existingText by stripping overlapping word prefixes.
 * Example: existingText = "The ocean", newText = "The ocean covers over 70 percent"
 * Result = "The ocean covers over 70 percent" (not "The ocean The ocean covers over 70 percent")
 */
function mergeWithDeduplication(existingText: string, newText: string): string {
  const existingTrimmed = existingText.trim();
  const newTrimmed = newText.trim();

  if (!existingTrimmed) return newTrimmed;
  if (!newTrimmed) return existingTrimmed;

  // Exact match or already contained at end
  if (existingTrimmed.endsWith(newTrimmed)) return existingTrimmed;
  if (newTrimmed.startsWith(existingTrimmed)) return newTrimmed;

  // Find longest overlapping suffix of existingText matching prefix of newText
  const existingWords = existingTrimmed.split(/\s+/);
  const newWords = newTrimmed.split(/\s+/);

  const maxOverlap = Math.min(existingWords.length, newWords.length);
  let overlapCount = 0;

  for (let len = maxOverlap; len > 0; len--) {
    const existingSuffix = existingWords.slice(-len).join(' ').toLowerCase();
    const newPrefix = newWords.slice(0, len).join(' ').toLowerCase();
    if (existingSuffix === newPrefix) {
      overlapCount = len;
      break;
    }
  }

  if (overlapCount > 0) {
    const remainingNewWords = newWords.slice(overlapCount).join(' ');
    return remainingNewWords ? `${existingTrimmed} ${remainingNewWords}` : existingTrimmed;
  }

  return `${existingTrimmed} ${newTrimmed}`;
}


export interface ModalConfig {
  isOpen: boolean;
  title?: string;
  message: string;
}

export interface ClipboardModalConfig {
  isOpen: boolean;
  text: string;
}

export interface TranscriptParagraph {
  id: string;
  speaker: 'local' | 'remote';
  text: string;
  isFinal: boolean;
  isLocked?: boolean;
  timestamp: number;
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
  transcripts: TranscriptParagraph[];
  clipboardText: string;

  // App Configuration & Standalone AI Helper
  enableHosting: boolean;
  isAiHelperActive: boolean;
  selectedMicId: string;
  selectedSpeakerId: string;

  // Actions
  setEnableHosting: (enableHosting: boolean) => void;
  setIsAiHelperActive: (isAiHelperActive: boolean) => void;
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
  setSelectedMicId: (id: string) => void;
  setSelectedSpeakerId: (id: string) => void;

  // Chat & Transcript Actions
  setIsSidePanelOpen: (open: boolean) => void;
  addChatMessage: (msg: ChatMessage) => void;
  addTranscriptParagraph: (p: TranscriptParagraph) => void;
  lockCurrentParagraph: () => void;
  clearTranscripts: () => void;

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
  transcripts: [],
  clipboardText: '',

  enableHosting: typeof window !== 'undefined' && localStorage.getItem('app_enable_hosting') !== null
    ? localStorage.getItem('app_enable_hosting') === 'true'
    : true,
  isAiHelperActive: false,
  selectedMicId: typeof window !== 'undefined' ? localStorage.getItem('app_selected_mic') || '' : '',
  selectedSpeakerId: typeof window !== 'undefined' ? localStorage.getItem('app_selected_speaker') || 'default' : 'default',

  setEnableHosting: (enableHosting) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('app_enable_hosting', String(enableHosting));
    }
    set({ enableHosting });
  },
  setIsAiHelperActive: (isAiHelperActive) => set({ isAiHelperActive }),
  setSelectedMicId: (selectedMicId) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('app_selected_mic', selectedMicId);
    }
    set({ selectedMicId });
  },
  setSelectedSpeakerId: (selectedSpeakerId) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('app_selected_speaker', selectedSpeakerId);
    }
    set({ selectedSpeakerId });
  },
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
  addTranscriptParagraph: (p) =>
    set((state) => {
      const list = [...state.transcripts];
      const newText = p.text ? p.text.trim() : '';
      if (!newText || newText.includes('🎙️') || newText.includes('Speaking...')) return state;

      const lastIdx = list.length - 1;
      
      let timeGap = 0;
      if (lastIdx >= 0) {
        timeGap = p.timestamp - list[lastIdx].timestamp;
      }

      // Append to the active (unlocked) paragraph for this speaker if present at the end, 
      // AND if the silence gap is less than 3.5 seconds. Otherwise, start a new paragraph.
      if (lastIdx >= 0 && list[lastIdx].speaker === p.speaker && !list[lastIdx].isLocked && timeGap < 3500) {
        const existingP = list[lastIdx];
        const mergedText = mergeWithDeduplication(existingP.text, newText);
        list[lastIdx] = {
          ...existingP,
          text: mergedText,
          isFinal: p.isFinal,
          timestamp: p.timestamp,
        };
        return { transcripts: list };
      } else {
        // Start a new paragraph block for the speaker
        return { transcripts: [...list, { ...p, text: newText }] };
      }
    }),


  lockCurrentParagraph: () =>
    set((state) => {
      const list = [...state.transcripts];
      if (list.length > 0 && !list[list.length - 1].isLocked) {
        list[list.length - 1] = { ...list[list.length - 1], isLocked: true };
        return { transcripts: list };
      }
      return state;
    }),



  clearTranscripts: () => set({ transcripts: [] }),
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

