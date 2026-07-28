import React, { useState } from 'react';

interface ViewerCardProps {
  onJoinSession: (code: string) => Promise<void>;
}

export const ViewerCard: React.FC<ViewerCardProps> = ({ onJoinSession }) => {
  const [inputCode, setInputCode] = useState<string>('');
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorNotice(null);
    let val = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    if (val.length > 4) {
      val = `${val.substring(0, 4)}-${val.substring(4, 8)}`;
    }
    setInputCode(val);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleJoin();
    }
  };

  const handleJoin = async () => {
    const clean = inputCode.replace(/-/g, '').trim();
    if (clean.length !== 8) {
      setErrorNotice('Please enter a valid 8-character session code (e.g. a7k9-x2p4)');
      return;
    }

    setIsConnecting(true);
    setErrorNotice(null);
    try {
      await onJoinSession(inputCode);
    } catch (err: any) {
      setErrorNotice(`Failed to join session: ${err?.message || err}`);
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-icon">🔗</div>
        <div>
          <div className="card-title">Join Remote Screen</div>
          <div className="card-subtitle">Enter 8-character code to view screen & hear live audio</div>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '14px' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', textAlign: 'center' }}>
          Remote Session Code:
        </div>
        <input
          type="text"
          className="code-input"
          value={inputCode}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="a7k9-x2p4"
          maxLength={9}
          autoComplete="off"
        />

        {errorNotice && (
          <div style={{ fontSize: '0.78rem', color: '#fca5a5', textAlign: 'center', background: 'rgba(239,68,68,0.15)', padding: '6px 10px', borderRadius: '6px', border: '1px solid rgba(239,68,68,0.3)' }}>
            ⚠️ {errorNotice}
          </div>
        )}

        <button className="btn" onClick={handleJoin} disabled={isConnecting}>
          {isConnecting ? 'Connecting to Host...' : '🔗 Connect & View Screen'}
        </button>
      </div>
    </div>
  );
};
