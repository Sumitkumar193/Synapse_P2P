import React from 'react';
import { SignalingMethod } from '../store/useAppStore';

interface TitleBarProps {
  statusText: string;
  statusState: 'ready' | 'hosting' | 'connected' | 'expired';
  signalingMethod: SignalingMethod;
  signalingHealth: Record<string, boolean>;
  onSignalingMethodChange: (method: SignalingMethod) => void;
  onOpen2ndWin: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  statusText,
  statusState,
  signalingMethod,
  signalingHealth,
  onSignalingMethodChange,
  onOpen2ndWin,
}) => {
  const handleMinimize = () => window.electronAPI?.minimizeWindow?.();
  const handleMaximize = () => window.electronAPI?.maximizeWindow?.();
  const handleClose = () => window.electronAPI?.closeWindow?.();

  const getPrimaryCascadeName = () => {
    if (signalingHealth.firebase) return '🟢 Firebase';
    if (signalingHealth.websocket) return '🟢 WebSocket';
    if (signalingHealth.webtorrent) return '🟢 WebTorrent';
    return '🟢 Memory';
  };

  return (
    <header>
      <div className="brand">
        <div className="brand-icon">P2P</div>
        <span className="brand-title">Screen Share</span>
      </div>

      <div className="header-right">
        <select
          className="signaling-select"
          value={signalingMethod}
          onChange={(e) => onSignalingMethodChange(e.target.value as SignalingMethod)}
          title="Select P2P Signaling Provider Method"
        >
          <option value="auto">
            ⚡ Auto Cascade ({getPrimaryCascadeName()})
          </option>
          <option value="firebase">
            {signalingHealth.firebase ? '🟢' : '🔴'} Firebase Realtime DB (HTTPS 443) — {signalingHealth.firebase ? 'Active' : 'Offline'}
          </option>
          <option value="websocket">
            {signalingHealth.websocket ? '🟢' : '🔴'} WebSocket Server (WSS 443) — {signalingHealth.websocket ? 'Active' : 'Offline'}
          </option>
          <option value="webtorrent">
            {signalingHealth.webtorrent ? '🟢' : '🔴'} WebTorrent Trackers {signalingHealth.activeTrackerUrl ? `(${String(signalingHealth.activeTrackerUrl).replace('wss://', '')})` : ''} — {signalingHealth.webtorrent ? 'Active' : 'Offline'}
          </option>
          <option value="ipc">
            {signalingHealth.ipc ? '🟢' : '⚪'} Electron IPC (Local) — {signalingHealth.ipc ? 'Active' : 'N/A'}
          </option>
          <option value="memory">
            🟢 Memory Safety Net — Active
          </option>
        </select>

        <button
          className="btn-new-win"
          onClick={onOpen2ndWin}
          title="Launch a second window to test Host & Viewer on same computer"
        >
          ➕ 2nd Window
        </button>

        <div className={`status-badge ${statusState}`}>
          <div className={`status-dot ${statusState}`}></div>
          <span>{statusText}</span>
        </div>

        <div className="window-controls">
          <button className="win-btn" onClick={handleMinimize} title="Minimize">&#8722;</button>
          <button className="win-btn" onClick={handleMaximize} title="Maximize">&#9633;</button>
          <button className="win-btn win-btn-close" onClick={handleClose} title="Close">&#10005;</button>
        </div>
      </div>
    </header>
  );
};
