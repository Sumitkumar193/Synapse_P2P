import React, { useEffect, useRef } from 'react';
import { P2PMediaSDK, DesktopSource } from '../sdk';
import { TitleBar } from './components/TitleBar';
import { HostCard } from './components/HostCard';
import { ViewerCard } from './components/ViewerCard';
import { StreamView } from './components/StreamView';
import { NotificationModal } from './components/NotificationModal';
import { useAppStore } from './store/useAppStore';

export const App: React.FC = () => {
  const sdkRef = useRef<P2PMediaSDK | null>(null);
  const timerRef = useRef<any>(null);

  // Zustand State Selectors
  const activeTab = useAppStore((state) => state.activeTab);
  const sources = useAppStore((state) => state.sources);
  const selectedSourceId = useAppStore((state) => state.selectedSourceId);
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

  // Zustand Store Actions
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const setSources = useAppStore((state) => state.setSources);
  const setSelectedSourceId = useAppStore((state) => state.setSelectedSourceId);
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

  useEffect(() => {
    const sdk = new P2PMediaSDK();
    sdkRef.current = sdk;

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
        setStatusText(`Connected (${typeDesc})`);
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

    return () => {
      stopTimer();
      sdk.disconnect().catch(console.error);
    };
  }, []);

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

  const handleOpen2ndWin = () => {
    window.electronAPI?.openNewWindow?.();
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
  };

  const handleStopSharing = async () => {
    stopTimer();
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

  return (
    <>
      <TitleBar
        statusText={statusText}
        statusState={statusState}
        onOpen2ndWin={handleOpen2ndWin}
      />

      <div className="app-body">
        {!isViewing ? (
          <div className="compact-container">
            {!isHosting && (
              <div className="nav-tabs">
                <button
                  className={`tab-btn ${activeTab === 'share' ? 'active' : ''}`}
                  onClick={() => setActiveTab('share')}
                >
                  <span>📺</span> Share Screen
                </button>
                <button
                  className={`tab-btn ${activeTab === 'join' ? 'active' : ''}`}
                  onClick={() => setActiveTab('join')}
                >
                  <span>🔗</span> Join Remote Screen
                </button>
              </div>
            )}

            {activeTab === 'share' || isHosting ? (
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
            ) : (
              <ViewerCard onJoinSession={handleJoinSession} />
            )}
          </div>
        ) : (
          <StreamView
            remoteStream={remoteStream}
            localStream={localStream}
            onEndSession={() => handleEndSession()}
          />
        )}
      </div>

      <NotificationModal
        isOpen={modalConfig.isOpen}
        title={modalConfig.title}
        message={modalConfig.message}
        onClose={closeModal}
      />
    </>
  );
};
