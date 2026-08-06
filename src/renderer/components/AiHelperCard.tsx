import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';

export const AiHelperCard: React.FC = () => {
  const isAiHelperActive = useAppStore((state) => state.isAiHelperActive);
  const setIsAiHelperActive = useAppStore((state) => state.setIsAiHelperActive);
  const setIsSidePanelOpen = useAppStore((state) => state.setIsSidePanelOpen);
  const [micVolume, setMicVolume] = useState(65);

  useEffect(() => {
    if (!isAiHelperActive) return;
    const interval = setInterval(() => {
      setMicVolume(Math.floor(40 + Math.random() * 50));
    }, 150);
    return () => clearInterval(interval);
  }, [isAiHelperActive]);

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-icon">🤖</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 className="card-title" style={{ margin: 0 }}>AI Copilot Helper</h2>
            <span
              className={`status-badge ${isAiHelperActive ? '' : 'expired'}`}
              style={{ fontSize: '0.7rem', padding: '2px 8px' }}
            >
              <span className={`status-dot ${isAiHelperActive ? '' : 'expired'}`} />
              {isAiHelperActive ? 'Mic Active' : 'Mic Muted'}
            </span>
          </div>
          <p className="card-subtitle">Local Whisper STT & MCP Agent (No Screen Share Required)</p>
        </div>
      </div>

      <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: '1.45', margin: '4px 0 8px 0' }}>
        Runs continuously in the background to capture microphone speech, transcribe via <strong>local Whisper STT</strong>, and automatically assist with technical interview questions using <strong>MCP tools</strong>.
      </p>

      {/* Audio Waveform Indicator */}
      <div style={{
        background: 'rgba(15, 23, 42, 0.7)',
        padding: '10px 12px',
        borderRadius: '8px',
        border: '1px solid rgba(255, 255, 255, 0.08)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#94a3b8', marginBottom: '6px' }}>
          <span>Microphone Input (16kHz PCM)</span>
          <span style={{ fontFamily: 'monospace', color: '#38bdf8', fontWeight: 600 }}>
            {isAiHelperActive ? `${micVolume}%` : 'MUTED'}
          </span>
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: '3px',
          height: '28px',
          background: 'rgba(9, 13, 22, 0.8)',
          padding: '4px 6px',
          borderRadius: '6px',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          overflow: 'hidden'
        }}>
          {[40, 65, 80, 55, 90, 75, 45, 60, 85, 95, 70, 50, 65, 80, 40].map((h, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                borderRadius: '2px',
                height: isAiHelperActive ? `${Math.min(100, Math.max(15, h * (micVolume / 70)))}%` : '15%',
                background: isAiHelperActive
                  ? 'linear-gradient(to top, #6366f1, #c084fc)'
                  : 'rgba(71, 85, 105, 0.4)',
                transition: 'height 0.15s ease-out'
              }}
            />
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '8px', marginTop: 'auto', paddingTop: '6px' }}>
        <button
          onClick={() => setIsAiHelperActive(!isAiHelperActive)}
          className="tab-btn"
          style={{
            flex: 1,
            background: isAiHelperActive ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
            color: isAiHelperActive ? '#f87171' : '#34d399',
            border: isAiHelperActive ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)',
            padding: '8px 12px',
            fontSize: '0.78rem'
          }}
        >
          {isAiHelperActive ? '⏸️ Pause Mic' : '🎙️ Resume Mic'}
        </button>

        <button
          onClick={() => setIsSidePanelOpen(true)}
          className="tab-btn active"
          style={{ flex: 1, padding: '8px 12px', fontSize: '0.78rem' }}
        >
          💬 Copilot Drawer
        </button>
      </div>
    </div>
  );
};
