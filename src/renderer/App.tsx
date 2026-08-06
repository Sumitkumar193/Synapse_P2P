import React, { useEffect, useRef } from 'react';
import {
  P2PMediaSDK,
  DesktopSource,
  FirebaseSignalingProvider,
  WebSocketSignalingProvider,
  WebTorrentSignalingProvider,
  IPCSignalingProvider,
  MemorySignalingProvider,
} from '../sdk';
import { TitleBar } from './components/TitleBar';
import { HostCard } from './components/HostCard';
import { ViewerCard } from './components/ViewerCard';
import { AiAssistantCard } from './components/AiAssistantCard';
import { StreamView } from './components/StreamView';
import { SideDrawer } from './components/SideDrawer';
import { NotificationModal } from './components/NotificationModal';
import { ClipboardModal } from './components/ClipboardModal';
import { SettingsPanelComponent } from './components/SettingsPanel';
import { ClosedCaptionOverlay } from './components/ClosedCaptionOverlay';
import { SessionEventBridge } from '../shared/SessionEventBridge';

import { eventBus } from '../shared/EventBus';
import { localAudioStreamer, remoteAudioStreamer, audioStreamer } from './utils/AudioStreamer';

import { SignalingMethod, ChatMessage, useAppStore } from './store/useAppStore';




export const App: React.FC = () => {
  const sdkRef = useRef<P2PMediaSDK | null>(null);
  const timerRef = useRef<any>(null);
  const lastCopiedRef = useRef<string>('');
  const settingsRef = useRef<SettingsPanelComponent | null>(null);

  useEffect(() => {
    const container = document.getElementById('settingsContainer');
    if (container) {
      const panel = new SettingsPanelComponent();
      panel.mount(container);
      panel.loadCurrentSettings();
      settingsRef.current = panel;
    }
  }, []);


  // Zustand State Selectors
  const activeTab = useAppStore((state) => state.activeTab);
  const sources = useAppStore((state) => state.sources);
  const selectedSourceId = useAppStore((state) => state.selectedSourceId);
  const signalingMethod = useAppStore((state) => state.signalingMethod);
  const enableHosting = useAppStore((state) => state.enableHosting);
  const isHosting = useAppStore((state) => state.isHosting);
  const isViewing = useAppStore((state) => state.isViewing);
  const sessionCode = useAppStore((state) => state.sessionCode);
  const statusState = useAppStore((state) => state.statusState);
  const statusText = useAppStore((state) => state.statusText);
  const remainingSeconds = useAppStore((state) => state.remainingSeconds);
  const isExpired = useAppStore((state) => state.isExpired);
  const remoteStream = useAppStore((state) => state.remoteStream);
  const localStream = useAppStore((state) => state.localStream);
  const modalConfig = useAppStore((state) => state.modalConfig);
  const clipboardModalConfig = useAppStore((state) => state.clipboardModalConfig);

  // Side Panel Zustand Actions
  const isSidePanelOpen = useAppStore((state) => state.isSidePanelOpen);
  const chatMessages = useAppStore((state) => state.chatMessages);
  const addChatMessage = useAppStore((state) => state.addChatMessage);
  const updateFileMessageProgress = useAppStore((state) => state.updateFileMessageProgress);
  const setClipboardText = useAppStore((state) => state.setClipboardText);
  const setIsSidePanelOpen = useAppStore((state) => state.setIsSidePanelOpen);
  const showClipboardModal = useAppStore((state) => state.showClipboardModal);
  const closeClipboardModal = useAppStore((state) => state.closeClipboardModal);

  // Zustand Store Actions
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const setSources = useAppStore((state) => state.setSources);
  const setSelectedSourceId = useAppStore((state) => state.setSelectedSourceId);
  const setSignalingMethod = useAppStore((state) => state.setSignalingMethod);
  const setIsHosting = useAppStore((state) => state.setIsHosting);
  const setIsViewing = useAppStore((state) => state.setIsViewing);
  const setSessionCode = useAppStore((state) => state.setSessionCode);
  const setStatusState = useAppStore((state) => state.setStatusState);
  const setStatusText = useAppStore((state) => state.setStatusText);
  const setRemainingSeconds = useAppStore((state) => state.setRemainingSeconds);
  const setIsExpired = useAppStore((state) => state.setIsExpired);
  const setRemoteStream = useAppStore((state) => state.setRemoteStream);
  const setLocalStream = useAppStore((state) => state.setLocalStream);
  const showNotice = useAppStore((state) => state.showNotice);
  const closeModal = useAppStore((state) => state.closeModal);
  const resetSessionState = useAppStore((state) => state.resetSessionState);

  const getSignalingProvider = (method: SignalingMethod) => {
    switch (method) {
      case 'firebase':
        return new FirebaseSignalingProvider({
          databaseURL: 'https://synapse-p2p-default-rtdb.asia-southeast1.firebasedatabase.app',
        });
      case 'websocket':
        return new WebSocketSignalingProvider();
      case 'webtorrent':
        return new WebTorrentSignalingProvider();
      case 'ipc':
        return new IPCSignalingProvider();
      case 'memory':
        return new MemorySignalingProvider();
      case 'auto':
      default:
        return undefined; // Uses default FallbackSignalingProvider
    }
  };

  useEffect(() => {
    if (sdkRef.current) {
      sdkRef.current.disconnect().catch(console.error);
    }

    const provider = getSignalingProvider(signalingMethod);
    const sdk = new P2PMediaSDK({ signalingProvider: provider });
    sdkRef.current = sdk;

    // Probe real-time signaling provider health on application launch
    sdk.checkSignalingHealth().then((health) => {
      console.log('[P2P App] Signaling provider health status:', health);
      setSignalingHealth(health);
    }).catch(console.error);

    // Load initial desktop sources
    loadDesktopSources(sdk);

    // Register SDK Event Listeners
    sdk.events.on('track-added', (_track, stream, peerId) => {
      console.log('[P2P App] Remote track received:', stream.getTracks());
      setRemoteStream(new MediaStream(stream.getTracks()));
      setIsViewing(true);
      setStatusState('connected');
      setStatusText(`Connected (${peerId})`);
    });

    sdk.events.on('peer-left', (_peerId) => {
      if (useAppStore.getState().isViewing) {
        handleEndSession('Session ended by user');
      }
    });

    sdk.events.on('connection-state-change', async (state) => {
      const { isViewing, isHosting } = useAppStore.getState();

      if (state === 'connected') {
        stopTimer();
        setStatusState('connected');
        const stats = await sdk.getConnectionStats();
        const typeDesc = stats?.connectionTypeDescription || 'Direct P2P';
        if (isHosting) {
          setStatusText(`Hosting (${sessionCode || 'Active'} | ${typeDesc})`);
        } else {
          setStatusText(`Viewing (${typeDesc})`);
        }

        // Wire up Session Data, File Transfer & Clipboard listeners
        const currentSession = sdk.session();
        if (currentSession) {
          if ((window as any).activeBridge) {
            (window as any).activeBridge.destroy();
          }
          (window as any).activeBridge = new SessionEventBridge(currentSession);

          currentSession.data.onMessage((msg) => {

            try {
              const data = typeof msg === 'string' ? JSON.parse(msg) : msg;
              if (data && data.type === 'app-chat' && data.text) {
                addChatMessage({
                  id: Date.now().toString(),
                  sender: 'remote',
                  kind: 'text',
                  text: data.text,
                  timestamp: data.timestamp || Date.now(),
                });
                setIsSidePanelOpen(true);
              }
            } catch {
              // Ignore non-chat messages
            }
          });

          currentSession.files.onReceive((file) => {
            const blob = new Blob([file.data]);
            const url = URL.createObjectURL(blob);
            addChatMessage({
              id: Date.now().toString(),
              sender: 'remote',
              kind: 'file',
              fileData: {
                name: file.name,
                size: file.size,
                url,
                isIncoming: true,
                progress: 100,
              },
              timestamp: Date.now(),
            });
            setIsSidePanelOpen(true);
            showNotice(`Received file "${file.name}" in Chat!`, 'File Transfer Received');
          });

          currentSession.clipboard.onClipboard((text) => {
            console.log('[P2P App] 📋 Received remote clipboard update:', text);
            setClipboardText(text);

            // Auto-populate into chat stream
            addChatMessage({
              id: Date.now().toString(),
              sender: 'remote',
              kind: 'clipboard',
              clipboardData: { text },
              timestamp: Date.now(),
            });

            // Automatically open side chat drawer to show auto-populated clipboard snippet
            setIsSidePanelOpen(true);
          });
        }
      } else if (state === 'disconnected') {
        if (isViewing || isHosting) {
          setStatusText('Reconnecting P2P...');
        } else {
          setStatusState('ready');
          setStatusText('Ready');
        }
      } else if (state === 'failed') {
        if (isViewing) {
          handleEndSession('Session ended by user');
        } else {
          setStatusState('ready');
          setStatusText('Ready');
        }
      }
    });

    sdk.events.on('session-expired', () => {
      handleAutoRotateCode();
    });

    // Automatic Host OS Clipboard Monitor (Polls OS clipboard every 1s when active host)
    const clipboardMonitorInterval = setInterval(async () => {
      const { isHosting, statusState } = useAppStore.getState();
      if (isHosting && statusState === 'connected') {
        try {
          const currentText = await window.electronAPI?.readClipboardText?.();
          if (currentText && currentText.trim() && currentText !== lastCopiedRef.current) {
            lastCopiedRef.current = currentText;
            console.log('[P2P App] 📋 Host copied text to OS clipboard. Auto-broadcasting to Joiner chat stream:', currentText);

            const session = sdk.session();
            if (session) {
              session.clipboard.write(currentText);
              addChatMessage({
                id: Date.now().toString(),
                sender: 'local',
                kind: 'clipboard',
                clipboardData: { text: currentText },
                timestamp: Date.now(),
              });
            }
          }
        } catch {
          // Ignore read errors
        }
      }
    }, 1000);

    // Automatic Closed Caption (CC) Chat Stream Integration
    const unsubCcLocal = eventBus.on('cc.chat.local', (evt: any) => {
      addChatMessage({
        id: Date.now().toString(),
        sender: 'local',
        kind: 'text',
        text: evt.text,
        timestamp: evt.timestamp || Date.now(),
      });
    });

    const unsubCcRemote = eventBus.on('cc.chat.remote', (evt: any) => {
      addChatMessage({
        id: Date.now().toString(),
        sender: 'remote',
        kind: 'text',
        text: evt.text,
        timestamp: evt.timestamp || Date.now(),
      });
    });

    return () => {
      stopTimer();
      unsubCcLocal();
      unsubCcRemote();
      clearInterval(clipboardMonitorInterval);
      sdk.disconnect().catch(console.error);
    };
  }, [signalingMethod]);

  // SPEAKER-FIRST PRIORITY: Focus 100% on incoming remote speaker audio for Whisper STT
  useEffect(() => {
    if (remoteStream && remoteStream.getAudioTracks().length > 0) {
      console.log('[Speaker-First Mode] 🔊 Prioritizing remote speaker audio for Whisper STT. Muting local mic STT.');
      localAudioStreamer.stop();
      remoteAudioStreamer.start(remoteStream, 'remote');
    } else {
      remoteAudioStreamer.stop();
    }
    return () => {
      remoteAudioStreamer.stop();
    };
  }, [remoteStream]);




  const loadDesktopSources = async (sdkInstance?: P2PMediaSDK) => {
    const sdk = sdkInstance || sdkRef.current;
    if (!sdk) return;

    try {
      let fetchedSources: DesktopSource[] = [];
      try {
        fetchedSources = await sdk.getDesktopSources(['screen', 'window']);
      } catch (e) {
        console.warn('Fallback desktop sources:', e);
      }

      if (!fetchedSources || fetchedSources.length === 0) {
        fetchedSources = [{ id: 'screen:0:0', name: 'Entire Screen (Primary Display)' }];
      }

      setSources(fetchedSources);
      if (fetchedSources.length > 0) {
        setSelectedSourceId(fetchedSources[0].id);
      }
    } catch (err: any) {
      console.error('Failed loading desktop sources:', err);
    }
  };

  const startTimer = () => {
    stopTimer();
    setRemainingSeconds(120);
    setIsExpired(false);

    timerRef.current = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          stopTimer();
          handleAutoRotateCode();
          return 120;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleAutoRotateCode = async () => {
    const sdk = sdkRef.current;
    const { statusState, isHosting } = useAppStore.getState();

    if (!sdk || statusState === 'connected' || isHosting) return;

    const newCode = sdk.generateSessionCode();
    const cleanRoomId = newCode.replace(/-/g, '');

    console.log(`[P2P App] 🔄 Auto-rotating session code to ${newCode}...`);
    setSessionCode(newCode);
    setStatusText(`Hosting (${newCode})`);
    startTimer();

    try {
      await sdk.connect(cleanRoomId, true);
    } catch (e) {
      console.warn('Non-fatal error during code rotation connect:', e);
    }
  };

  const handleStartSharing = async (sysAudio: boolean, micAudio: boolean) => {
    const sdk = sdkRef.current;
    if (!sdk) return;

    await sdk.disconnect();
    stopTimer();

    const code = sdk.generateSessionCode();
    const cleanRoomId = code.replace(/-/g, '');

    setSessionCode(code);
    setIsHosting(true);
    setStatusState('hosting');
    setStatusText(`Hosting (${code})`);
    startTimer();

    // Connect to signaling
    await sdk.connect(cleanRoomId, true);

    // Start screen capture
    const targetSourceId = selectedSourceId || 'screen:0:0';
    const stream = await sdk.startScreenShare({
      sourceId: targetSourceId,
      includeSystemAudio: sysAudio,
      includeMicrophone: micAudio,
    });

    // Handle OS window closure or track termination gracefully
    stream.getTracks().forEach((track) => {
      track.onended = () => {
        console.log('[P2P App] Captured track ended (window closed by OS). Stopping host share session...');
        handleStopSharing();
      };
    });

    setLocalStream(stream);

    useAppStore.getState().setIsAiHelperActive(true);
    if (!remoteStream || remoteStream.getAudioTracks().length === 0) {
      console.log('[Host Mode] 🎙️ No active remote speaker stream. Starting local mic streamer...');
      localAudioStreamer.start(stream, 'local');
    }
  };


  const handleStopSharing = async () => {
    stopTimer();
    audioStreamer.stop();
    useAppStore.getState().setIsAiHelperActive(false);
    resetSessionState();

    const sdk = sdkRef.current;
    if (sdk) {
      await sdk.disconnect();
    }

    loadDesktopSources();
  };


  const handleJoinSession = async (code: string) => {
    const sdk = sdkRef.current;
    if (!sdk) return;

    const cleanRoomId = code.replace(/-/g, '').toLowerCase();

    if (sessionCode && cleanRoomId === sessionCode.replace(/-/g, '')) {
      showNotice(
        `You are hosting code ${code} in this window!\n\nTo view this screen, click "+ Open 2nd Window" in the titlebar and enter code ${code}.`,
        'Active Host Session'
      );
      return;
    }

    setStatusState('hosting');
    setStatusText(`Connecting (${code})...`);

    await sdk.connect(cleanRoomId, false);
  };

  const handleEndSession = async (noticeMessage?: string) => {
    stopTimer();
    resetSessionState();

    const sdk = sdkRef.current;
    if (sdk) {
      await sdk.disconnect();
    }

    loadDesktopSources();

    if (noticeMessage) {
      showNotice(noticeMessage, 'Session Disconnected');
    }
  };

  const handleSendMessage = (text: string) => {
    const sdk = sdkRef.current;
    const session = sdk?.session();

    const msg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'local',
      kind: 'text',
      text,
      timestamp: Date.now(),
    };
    addChatMessage(msg);

    if (session) {
      session.data.sendJson({
        type: 'app-chat',
        text,
        timestamp: msg.timestamp,
      });
    }
  };

  const handleSendFile = async (file: File) => {
    const sdk = sdkRef.current;
    const session = sdk?.session();
    if (!session) {
      showNotice('Must be connected to a peer to send files.', 'File Transfer Error');
      return;
    }

    const fileId = Date.now().toString();
    const arrayBuffer = await file.arrayBuffer();

    const fileMsg: ChatMessage = {
      id: fileId,
      sender: 'local',
      kind: 'file',
      fileData: {
        name: file.name,
        size: file.size,
        url: URL.createObjectURL(file),
        isIncoming: false,
        progress: 0,
      },
      timestamp: Date.now(),
    };
    addChatMessage(fileMsg);

    session.files.onProgress((progress) => {
      updateFileMessageProgress(fileId, progress.percentage);
    });

    await session.files.send(arrayBuffer, file.name);
  };

  const handleSyncClipboard = (text: string) => {
    const sdk = sdkRef.current;
    const session = sdk?.session();
    setClipboardText(text);

    addChatMessage({
      id: Date.now().toString(),
      sender: 'local',
      kind: 'clipboard',
      clipboardData: { text },
      timestamp: Date.now(),
    });

    if (session) {
      session.clipboard.write(text);
    }
  };

  const signalingHealth = useAppStore((state) => state.signalingHealth);
  const setSignalingHealth = useAppStore((state) => state.setSignalingHealth);

  return (
    <>
      <TitleBar
        statusText={statusText}
        statusState={statusState}
        signalingMethod={signalingMethod}
        signalingHealth={signalingHealth}
        chatBadgeCount={chatMessages.length}
        isChatOpen={isSidePanelOpen}
        onToggleChat={() => setIsSidePanelOpen(!isSidePanelOpen)}
        onOpenSettings={() => settingsRef.current?.toggle()}
        onSignalingMethodChange={setSignalingMethod}
      />


      <div className="app-body">
        <div className="app-main-content">
          {!isViewing ? (
            <div className="compact-container">
              <div className="dual-dashboard-grid">
                {/* 1st Card: AI & Speech Assistant Card */}
                <AiAssistantCard onOpenDrawer={() => setIsSidePanelOpen(true)} />

                {/* 2nd Card: Host Screen Share Card (if enableHosting === true) */}
                {enableHosting && (
                  <HostCard
                    sources={sources}
                    selectedSourceId={selectedSourceId}
                    onSelectSource={(id) => setSelectedSourceId(id)}
                    onRefreshSources={() => loadDesktopSources()}
                    onStartSharing={handleStartSharing}
                    onStopSharing={handleStopSharing}
                    isHosting={isHosting}
                    isConnected={statusState === 'connected'}
                    sessionCode={sessionCode}
                    remainingSeconds={remainingSeconds}
                    isExpired={isExpired}
                  />
                )}

                {/* 3rd Card: Join Remote Screen Card (if not hosting) */}
                {!isHosting && <ViewerCard onJoinSession={handleJoinSession} />}
              </div>
            </div>

          ) : (
            <StreamView
              remoteStream={remoteStream}
              localStream={localStream}
              onEndSession={() => handleEndSession()}
              onSendMessage={handleSendMessage}
              onSendFile={handleSendFile}
              onSyncClipboard={handleSyncClipboard}
            />
          )}
        </div>

        {/* SIDEBAR FLEX PANEL - Rendered side-by-side on both Host & Viewer */}
        {isSidePanelOpen && (
          <SideDrawer
            onSendMessage={handleSendMessage}
            onSendFile={handleSendFile}
            onSyncClipboard={handleSyncClipboard}
            onClose={() => setIsSidePanelOpen(false)}
          />
        )}
      </div>

      <ClosedCaptionOverlay />

      <NotificationModal

        isOpen={modalConfig.isOpen}
        title={modalConfig.title}
        message={modalConfig.message}
        onClose={closeModal}
      />

      <ClipboardModal
        isOpen={clipboardModalConfig.isOpen}
        text={clipboardModalConfig.text}
        onClose={closeClipboardModal}
      />

      <div id="settingsContainer"></div>
    </>
  );

};
