import React from 'react';
import { useAppStore } from '../store/useAppStore';
import { localAudioStreamer } from '../utils/AudioStreamer';
import { ResumeContextManager } from './ResumeContextManager';

interface AiAssistantCardProps {
  onOpenDrawer?: () => void;
}

export const AiAssistantCard: React.FC<AiAssistantCardProps> = ({ onOpenDrawer }) => {
  const isAiHelperActive = useAppStore((state) => state.isAiHelperActive);
  const setIsAiHelperActive = useAppStore((state) => state.setIsAiHelperActive);
  const isHosting = useAppStore((state) => state.isHosting);
  const selectedMicId = useAppStore((state) => state.selectedMicId);
  const enableMicListening = useAppStore((state) => state.enableMicListening);
  const setEnableMicListening = useAppStore((state) => state.setEnableMicListening);
  const isResumeManagerOpen = useAppStore((state) => state.isResumeManagerOpen);
  const setIsResumeManagerOpen = useAppStore((state) => state.setIsResumeManagerOpen);

  const handleToggleListening = async () => {
    if (isHosting) return; // Automatic during active screen share session
    if (isAiHelperActive) {
      localAudioStreamer.stop();
      setIsAiHelperActive(false);
    } else {
      try {
        const audioTracks: MediaStreamTrack[] = [];

        // 1. Microphone Audio (User Voice) - Preserved intact, captured ONLY if enableMicListening is true
        if (enableMicListening) {
          try {
            const micStream = await navigator.mediaDevices.getUserMedia({ 
              audio: {
                deviceId: selectedMicId ? { exact: selectedMicId } : undefined,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                googEchoCancellation: true,
                googAutoGainControl: true,
                googNoiseSuppression: true,
                googHighpassFilter: true,
              } as any
            });
            micStream.getAudioTracks().forEach((track) => {
              console.log(`[AI Assistant] 🎤 Captured Microphone: ${track.label}`);
              audioTracks.push(track);
            });
          } catch (err) {
            console.warn('[AI Assistant] Mic capture skipped or denied:', err);
          }
        } else {
          console.log('[AI Assistant] 🔇 Local mic listening disabled by user setting. Listening strictly to system speaker loopback audio.');
        }

        // 2. Capture Entire Screen System Speaker Audio (Computer Output / Playback / Zoom) via Electron Desktop Source
        try {
          let screenSourceId = 'screen:0:0';
          if (typeof window !== 'undefined' && (window as any).electronAPI?.getDesktopSources) {
            const sources = await (window as any).electronAPI.getDesktopSources({ types: ['screen'] });
            if (sources && sources.length > 0) {
              screenSourceId = sources[0].id;
            }
          }

          const systemStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: screenSourceId,
              },
            } as any,
            video: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: screenSourceId,
              },
            } as any,
          });

          systemStream.getAudioTracks().forEach((track) => audioTracks.push(track));
        } catch (err) {
          console.warn('[AI Assistant] System speaker audio loopback skipped:', err);
        }

        if (audioTracks.length === 0) {
          alert('No audio sources (system speakers) were available.');
          return;
        }

        const combinedStream = new MediaStream(audioTracks);
        await localAudioStreamer.start(combinedStream, 'local');
        setIsAiHelperActive(true);
      } catch (err) {
        console.warn('Could not start speech listening:', err);
      }
    }
  };

  const isActive = isHosting || isAiHelperActive;

  return (
    <>
      <div className="card" style={{ gap: '16px' }}>
        <div className="card-header" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="card-icon" style={{ background: 'rgba(99, 102, 241, 0.2)', color: '#818cf8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', borderRadius: '10px' }}>
              🤖
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#f8fafc' }}>AI & Speech Assistant</h3>
              <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8' }}>Real-time Whisper STT & Candidate Resume RAG</p>
            </div>
          </div>
          <div className={`status-badge ${isActive ? 'hosting' : 'ready'}`} style={{ padding: '4px 10px', fontSize: '0.72rem' }}>
            <div className={`status-dot ${isActive ? 'hosting' : 'ready'}`}></div>
            <span>{isHosting ? 'Live (Screen Share)' : isAiHelperActive ? 'Live Speaker Listening' : 'Offline'}</span>
          </div>
        </div>

        {/* Controls Bar: Mic Listening Toggle & Resume RAG Button */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.76rem', color: '#cbd5e1', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={enableMicListening}
              onChange={(e) => setEnableMicListening(e.target.checked)}
              style={{ accentColor: '#818cf8', cursor: 'pointer' }}
            />
            <span>🎙️ Enable Mic Listening (Default: Off / Speaker Only)</span>
          </label>

          <button
            onClick={() => setIsResumeManagerOpen(true)}
            style={{
              padding: '6px 12px',
              background: 'rgba(99, 102, 241, 0.15)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              borderRadius: '8px',
              color: '#a78bfa',
              fontSize: '0.76rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            📄 Resume RAG Embeddings →
          </button>
        </div>

        {/* Main Start / Pause Listening Button */}
        <button
          onClick={handleToggleListening}
          disabled={isHosting}
          style={{
            width: '100%',
            padding: '12px 18px',
            borderRadius: '10px',
            fontSize: '0.9rem',
            fontWeight: 700,
            cursor: isHosting ? 'default' : 'pointer',
            border: isActive ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(16, 185, 129, 0.4)',
            background: isHosting ? 'rgba(99, 102, 241, 0.25)' : isAiHelperActive ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)',
            color: isHosting ? '#a78bfa' : isAiHelperActive ? '#f87171' : '#34d399',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            boxShadow: isActive ? '0 4px 14px rgba(99, 102, 241, 0.2)' : '0 4px 14px rgba(16, 185, 129, 0.2)',
            transition: 'all 0.2s ease',
          }}
        >
          {isHosting
            ? '🔒 Live Transcribing (Active Screen Share)'
            : isAiHelperActive
            ? '🔴 Pause Speaker Speech Listening'
            : '▶️ Start Speaker Speech Listening'}
        </button>

        {/* Capabilities & Features Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', marginTop: '2px' }}>
          <div style={{ background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '8px 10px' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#818cf8' }}>🔊 Speaker STT</div>
            <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '2px' }}>Computer Loopback Question Capture</div>
          </div>

          <div style={{ background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '8px 10px' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#38bdf8' }}>📄 Resume RAG</div>
            <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '2px' }}>Sumit Kumar's Pre-indexed Context</div>
          </div>

          <div style={{ background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '8px 10px' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#a78bfa' }}>💬 AI Interviewer Copilot</div>
            <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '2px' }}>1st-Person Tailored Q&A Answers</div>
          </div>

          <div style={{ background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '8px 10px' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#34d399' }}>⚡ Zero-Latency</div>
            <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '2px' }}>Instant RAG Embedding Search</div>
          </div>
        </div>

        {onOpenDrawer && (
          <button
            onClick={onOpenDrawer}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#cbd5e1',
              borderRadius: '8px',
              padding: '8px',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
              textAlign: 'center',
            }}
          >
            💬 Open Transcripts & AI Copilot Drawer →
          </button>
        )}
      </div>

      <ResumeContextManager isOpen={isResumeManagerOpen} onClose={() => setIsResumeManagerOpen(false)} />
    </>
  );
};

