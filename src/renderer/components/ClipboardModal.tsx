import React, { useState } from 'react';

interface ClipboardModalProps {
  isOpen: boolean;
  text: string;
  onClose: () => void;
}

export const ClipboardModal: React.FC<ClipboardModalProps> = ({
  isOpen,
  text,
  onClose,
}) => {
  const [copied, setCopied] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }).catch(console.error);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ maxWidth: '460px' }}>
        <div className="modal-header">
          <div className="modal-icon" style={{ background: 'rgba(99, 102, 241, 0.25)', color: '#818cf8' }}>
            📋
          </div>
          <div className="modal-title">Host Clipboard Received</div>
        </div>

        <div className="modal-body" style={{ marginTop: '12px' }}>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
            The remote Host copied new text to the shared clipboard:
          </p>
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.85)',
              border: '1px solid var(--glass-border)',
              borderRadius: '8px',
              padding: '12px',
              fontFamily: 'monospace',
              fontSize: '0.82rem',
              color: 'var(--text-main)',
              maxHeight: '160px',
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {text}
          </div>
        </div>

        <div className="modal-footer" style={{ gap: '10px', marginTop: '16px' }}>
          <button
            className="btn"
            style={{
              flex: 1,
              padding: '8px 14px',
              fontSize: '0.82rem',
              background: copied ? '#10b981' : '#6366f1',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onClick={handleCopy}
          >
            {copied ? '✅ Copied to Your Clipboard!' : '📋 Copy to My Clipboard'}
          </button>
          <button
            className="btn"
            style={{
              padding: '8px 16px',
              fontSize: '0.82rem',
              background: 'rgba(30, 41, 59, 0.8)',
              color: 'var(--text-main)',
              border: '1px solid var(--glass-border)',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
            onClick={onClose}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};
