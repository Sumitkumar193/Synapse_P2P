import React, { useState } from 'react';
import { DesktopSource } from '../../sdk';
import { SourceCard } from './SourceCard';

interface HostCardProps {
  sources: DesktopSource[];
  selectedSourceId: string;
  onSelectSource: (id: string) => void;
  onRefreshSources: () => void;
  onStartSharing: (sysAudio: boolean, micAudio: boolean) => Promise<void>;
  onStopSharing: () => Promise<void>;
  isHosting: boolean;
  isConnected: boolean;
  sessionCode: string | null;
  remainingSeconds: number;
  isExpired: boolean;
}

export const HostCard: React.FC<HostCardProps> = ({
  sources,
  selectedSourceId,
  onSelectSource,
  onRefreshSources,
  onStartSharing,
  onStopSharing,
  isHosting,
  isConnected,
  sessionCode,
  remainingSeconds,
  isExpired,
}) => {
  const [chkSysAudio, setChkSysAudio] = useState<boolean>(true);
  const [chkMicAudio, setChkMicAudio] = useState<boolean>(true);
  const [isCopying, setIsCopying] = useState<boolean>(false);
  const [isInitializing, setIsInitializing] = useState<boolean>(false);

  const formatTimer = (totalSeconds: number) => {
    if (isConnected) return '🔒 P2P Connected — Stream Active';
    if (totalSeconds <= 0) return '⚠️ Code Expired';
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `⏱️ Code expires in ${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const handleStart = async () => {
    setIsInitializing(true);
    try {
      await onStartSharing(chkSysAudio, chkMicAudio);
    } finally {
      setIsInitializing(false);
    }
  };

  const handleCopy = () => {
    if (sessionCode) {
      navigator.clipboard.writeText(sessionCode);
      setIsCopying(true);
      setTimeout(() => setIsCopying(false), 2000);
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-icon">📺</div>
        <div>
          <div className="card-title">Share This Screen</div>
          <div className="card-subtitle">
            {isHosting
              ? '🔒 Source locked to active screen share session'
              : 'Select screen or window to share with remote user'}
          </div>
        </div>
      </div>

      <div className="sources-header">
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>
          Select Display Source: {isHosting && <span style={{ color: '#a78bfa', fontSize: '0.75rem' }}>(Locked)</span>}
        </div>
        <button
          className="btn-refresh"
          onClick={onRefreshSources}
          disabled={isHosting}
          title={isHosting ? 'Source selection locked during active session' : 'Rescan displays'}
          style={{ opacity: isHosting ? 0.4 : 1, cursor: isHosting ? 'not-allowed' : 'pointer' }}
        >
          🔄 Rescan
        </button>
      </div>

      <div
        className="sources-grid"
        style={{
          pointerEvents: isHosting ? 'none' : 'auto',
          opacity: isHosting ? 0.5 : 1,
          filter: isHosting ? 'grayscale(0.3)' : 'none',
          transition: 'all 0.3s ease',
        }}
      >
        {sources.length > 0 ? (
          sources.map((src) => (
            <SourceCard
              key={src.id}
              source={src}
              isSelected={src.id === selectedSourceId}
              onSelect={onSelectSource}
            />
          ))
        ) : (
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', gridColumn: '1/-1' }}>
            Scanning displays...
          </div>
        )}
      </div>

      <div className="info-note">
        {isHosting ? (
          <span>🔒 <strong>Session Active:</strong> Display source & audio settings locked to current session code. Click Stop Sharing to unlock.</span>
        ) : (
          <span>💡 <strong>Tip:</strong> Sharing Entire Screen shares your complete desktop, active applications, and window views in real time.</span>
        )}
      </div>

      <div className="toggle-group" style={{ opacity: isHosting ? 0.5 : 1, pointerEvents: isHosting ? 'none' : 'auto' }}>
        <label className="toggle-label" style={{ cursor: isHosting ? 'not-allowed' : 'pointer' }}>
          <input
            type="checkbox"
            checked={chkSysAudio}
            disabled={isHosting}
            onChange={(e) => setChkSysAudio(e.target.checked)}
          />
          🔊 Speaker Sound (System Audio)
        </label>
        <label className="toggle-label" style={{ cursor: isHosting ? 'not-allowed' : 'pointer' }}>
          <input
            type="checkbox"
            checked={chkMicAudio}
            disabled={isHosting}
            onChange={(e) => setChkMicAudio(e.target.checked)}
          />
          🎙️ Microphone Audio
        </label>
      </div>

      {!isHosting ? (
        <button className="btn" onClick={handleStart} disabled={isInitializing}>
          {isInitializing ? 'Initializing Stream...' : '🚀 Start Sharing & Create Code'}
        </button>
      ) : (
        <div className="code-box">
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>
            YOUR SESSION CODE
          </div>
          <div className="code-val">{isExpired ? 'EXPIRED' : sessionCode || '---- ----'}</div>

          <div
            style={{
              fontSize: '0.8rem',
              fontWeight: 600,
              color: isConnected ? '#10b981' : isExpired ? '#ef4444' : '#f59e0b',
            }}
          >
            {formatTimer(remainingSeconds)}
          </div>

          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {isConnected
              ? 'Remote viewer is connected and watching your screen in real time.'
              : isExpired
              ? 'Session expired after 120s. Click Stop Sharing to reset.'
              : 'Waiting for remote viewer to join...'}
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              className="btn btn-secondary"
              onClick={handleCopy}
              disabled={!sessionCode}
              style={{ width: 'auto', whiteSpace: 'nowrap', fontSize: '0.82rem', padding: '7px 16px' }}
            >
              {isCopying ? '✓ Copied!' : '📋 Copy Code'}
            </button>
            <button
              className="btn btn-danger"
              onClick={onStopSharing}
              style={{ width: 'auto', whiteSpace: 'nowrap', fontSize: '0.82rem', padding: '7px 16px' }}
            >
              🛑 Stop Sharing
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
