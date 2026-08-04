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

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      console.log('[StreamView] Attaching remoteStream to video element. Tracks:', remoteStream.getTracks());
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.muted = isAudioMuted;
      
      const playPromise = remoteVideoRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('[StreamView] Remote autoplay blocked, attempting muted play fallback:', err);
          if (remoteVideoRef.current) {
            remoteVideoRef.current.muted = true;
            remoteVideoRef.current.play().catch(console.error);
          }
        });
      }

      const handleTrackChange = () => {
        if (remoteVideoRef.current && remoteStream) {
          console.log('[StreamView] Stream tracks updated dynamically:', remoteStream.getTracks());
          remoteVideoRef.current.srcObject = new MediaStream(remoteStream.getTracks());
          remoteVideoRef.current.play().catch(console.error);
        }
      };

      remoteStream.onaddtrack = handleTrackChange;
      remoteStream.onremovetrack = handleTrackChange;

      return () => {
        remoteStream.onaddtrack = null;
        remoteStream.onremovetrack = null;
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
    setIsAudioMuted(!isAudioMuted);
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
