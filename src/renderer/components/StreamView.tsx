import React, { useRef, useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { ClosedCaptionOverlay } from './ClosedCaptionOverlay';

interface StreamViewProps {
  remoteStream: MediaStream | null;
  localStream: MediaStream | null;
  onEndSession: () => Promise<void>;
  onSendMessage: (text: string) => void;
  onSendFile: (file: File) => void;
  onSyncClipboard: (text: string) => void;
}

export const StreamView: React.FC<StreamViewProps> = ({
  remoteStream,
  localStream,
  onEndSession,
}) => {
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const isHosting = useAppStore((state) => state.isHosting);
  const [isAudioMuted, setIsAudioMuted] = useState<boolean>(false);
  const [isMicMuted, setIsMicMuted] = useState<boolean>(!isHosting);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);


  const isSidePanelOpen = useAppStore((state) => state.isSidePanelOpen);
  const setIsSidePanelOpen = useAppStore((state) => state.setIsSidePanelOpen);
  const chatMessages = useAppStore((state) => state.chatMessages);


  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const selectedSpeakerId = useAppStore((state) => state.selectedSpeakerId);
  const [showAutoplayBanner, setShowAutoplayBanner] = useState<boolean>(false);

  // Apply speaker output device routing (setSinkId) safely
  useEffect(() => {
    if (remoteVideoRef.current && typeof (remoteVideoRef.current as any).setSinkId === 'function') {
      const sinkId = selectedSpeakerId || 'default';
      (remoteVideoRef.current as any).setSinkId(sinkId).catch((err: any) => {
        console.warn('[StreamView] Failed to route speaker output:', err);
      });
    }
  }, [selectedSpeakerId, remoteStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      console.log('[StreamView] Attaching remoteStream to video element. Tracks:', remoteStream.getTracks());
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.muted = isAudioMuted;

      const attemptPlay = async () => {
        if (!remoteVideoRef.current) return;
        try {
          remoteVideoRef.current.muted = isAudioMuted;
          await remoteVideoRef.current.play();
          setShowAutoplayBanner(false);
        } catch (err) {
          console.warn('[StreamView] Remote unmuted autoplay blocked, attempting muted play fallback:', err);
          if (remoteVideoRef.current) {
            remoteVideoRef.current.muted = true;
            await remoteVideoRef.current.play().catch(console.error);
            if (!isAudioMuted) {
              setShowAutoplayBanner(true);
            }
          }
        }
      };

      attemptPlay();

      const handleUserInteraction = () => {
        if (remoteVideoRef.current && !isAudioMuted) {
          remoteVideoRef.current.muted = false;
          remoteVideoRef.current.play().then(() => {
            setShowAutoplayBanner(false);
          }).catch(console.error);
        }
      };

      window.addEventListener('click', handleUserInteraction, { once: true });
      window.addEventListener('keydown', handleUserInteraction, { once: true });
      window.addEventListener('pointerdown', handleUserInteraction, { once: true });

      const handleTrackChange = () => {
        if (remoteVideoRef.current && remoteStream) {
          console.log('[StreamView] Stream tracks updated dynamically:', remoteStream.getTracks());
          remoteVideoRef.current.srcObject = new MediaStream(remoteStream.getTracks());
          attemptPlay();
        }
      };

      remoteStream.onaddtrack = handleTrackChange;
      remoteStream.onremovetrack = handleTrackChange;

      return () => {
        window.removeEventListener('click', handleUserInteraction);
        window.removeEventListener('keydown', handleUserInteraction);
        window.removeEventListener('pointerdown', handleUserInteraction);
        if (remoteStream) {
          remoteStream.onaddtrack = null;
          remoteStream.onremovetrack = null;
        }
      };
    }
  }, [remoteStream, isAudioMuted]);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.muted = true; // Always muted locally to prevent feedback echo
      localVideoRef.current.play().catch(console.error);
    }
  }, [localStream]);

  const toggleAudio = () => {
    const nextMuteState = !isAudioMuted;
    setIsAudioMuted(nextMuteState);
    if (remoteVideoRef.current) {
      remoteVideoRef.current.muted = nextMuteState;
      if (!nextMuteState) {
        remoteVideoRef.current.play().then(() => setShowAutoplayBanner(false)).catch(console.error);
      }
    }
  };

  const toggleMic = async () => {
    const nextMuteState = !isMicMuted;
    setIsMicMuted(nextMuteState);

    if (localStream && localStream.getAudioTracks().length > 0) {
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = !nextMuteState;
      });
    } else if (!nextMuteState) {
      // Joiner dynamic microphone publishing over WebRTC
      if (typeof window !== 'undefined' && (window as any).sdkInstance) {
        const micTrack = await (window as any).sdkInstance.publishMicrophone();
        if (micTrack) {
          micTrack.enabled = true;
        }
      }
    }
  };


  const toggleFullscreen = () => {
    if (remoteVideoRef.current) {
      if (!document.fullscreenElement) {
        remoteVideoRef.current.requestFullscreen().catch(console.error);
      } else {
        document.exitFullscreen().catch(console.error);
      }
    }
  };

  return (
    <div className="session-view">
      <div className="video-viewport relative">
        <video ref={remoteVideoRef} autoPlay playsInline />
        <ClosedCaptionOverlay />
        {showAutoplayBanner && (
          <div 
            onClick={() => {
              if (remoteVideoRef.current) {
                remoteVideoRef.current.muted = false;
                remoteVideoRef.current.play().then(() => setShowAutoplayBanner(false)).catch(console.error);
              }
            }}
            style={{
              position: 'absolute',
              top: '20px',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(239, 68, 68, 0.9)',
              color: '#fff',
              padding: '8px 16px',
              borderRadius: '20px',
              fontSize: '13px',
              fontWeight: 'bold',
              cursor: 'pointer',
              zIndex: 10,
              boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            🔊 Click anywhere to unmute incoming audio
          </div>
        )}
        {localStream && (

          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            style={{
              position: 'absolute',
              top: '14px',
              right: '14px',
              width: '160px',
              height: '95px',
              borderRadius: '8px',
              border: '1.5px solid var(--glass-border)',
              objectFit: 'cover',
              boxShadow: '0 6px 20px rgba(0,0,0,0.6)',
              zIndex: 5,
            }}
          />
        )}
      </div>

      <div className="control-bar">
        <button
          className={`ctrl-btn ${isSidePanelOpen ? 'active' : ''}`}
          onClick={() => setIsSidePanelOpen(!isSidePanelOpen)}
        >
          💬 Chat & Media {chatMessages.length > 0 ? `(${chatMessages.length})` : ''}
        </button>
        <button
          className={`ctrl-btn ${isMicMuted ? 'active-warning' : ''}`}
          onClick={toggleMic}
          title="Toggles your microphone to speak in the session"
        >
          {isMicMuted ? '🎙️ Mic Muted' : '🎙️ Mic Active'}
        </button>
        <button className="ctrl-btn" onClick={toggleAudio}>
          {isAudioMuted ? '🔇 Unmute Speaker' : '🔊 Mute Speaker'}
        </button>

        <button className="ctrl-btn" onClick={toggleFullscreen}>
          {isFullscreen ? '↙ Exit Fullscreen' : '⛶ Fullscreen'}
        </button>
        <button className="ctrl-btn ctrl-btn-danger" onClick={onEndSession}>
          🔴 End Session
        </button>
      </div>
    </div>
  );
};
