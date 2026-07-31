import React from 'react';
import { SignalingMethod } from '../store/useAppStore';

interface TitleBarProps {
  statusText: string;
  statusState: 'ready' | 'hosting' | 'connected' | 'expired';
  signalingMethod: SignalingMethod;
  signalingHealth: Record<string, boolean>;
  chatBadgeCount?: number;
  isChatOpen?: boolean;
  onToggleChat?: () => void;
  onOpenSettings?: () => void;
  onSignalingMethodChange: (method: SignalingMethod) => void;
  onOpen2ndWin: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  statusText,
  statusState,
  chatBadgeCount = 0,
  isChatOpen = false,
  onToggleChat,
  onOpenSettings,
  onOpen2ndWin,
}) => {
  const handleMinimize = () => window.electronAPI?.minimizeWindow?.();
  const handleMaximize = () => window.electronAPI?.maximizeWindow?.();
  const handleClose = () => window.electronAPI?.closeWindow?.();

  const handleOpenSettings = () => {
    if (onOpenSettings) {
      onOpenSettings();
    } else if ((window as any).settingsComponentInstance) {
      (window as any).settingsComponentInstance.toggle();
    }
  };


  return (
    <header>
      <div className="brand">
        <div className="brand-icon">P2P</div>
        <span className="brand-title">Screen Share</span>
      </div>

      <div className="header-right">
        <div className={`status-badge ${statusState}`}>
          <div className={`status-dot ${statusState}`}></div>
          <span>{statusText}</span>
        </div>

        {onToggleChat && (
          <button
            className="btn-new-win"
            onClick={onToggleChat}
            title="Toggle Chat & AI Copilot Sidebar"
            style={{
              background: isChatOpen ? 'rgba(99, 102, 241, 0.4)' : 'rgba(99, 102, 241, 0.15)',
              color: isChatOpen ? 'white' : '#818cf8',
              borderColor: isChatOpen ? '#818cf8' : undefined,
            }}
          >
            💬 Chat {chatBadgeCount > 0 ? `(${chatBadgeCount})` : ''}
          </button>
        )}

        {/* Dedicated Settings Button */}
        <button
          className="btn-new-win"
          onClick={handleOpenSettings}
          title="Open Preferences & Settings Modal"
          style={{
            background: 'rgba(255, 255, 255, 0.1)',
            color: '#f8fafc',
            borderColor: 'rgba(255, 255, 255, 0.2)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          ⚙️ Settings
        </button>

        <button
          className="btn-new-win"
          onClick={onOpen2ndWin}
          title="Launch a second window to test Host & Viewer on same computer"
        >
          ➕ 2nd Window
        </button>

        <div className="window-controls">
          <button className="win-btn" onClick={handleMinimize} title="Minimize">&#8722;</button>
          <button className="win-btn" onClick={handleMaximize} title="Maximize">&#9633;</button>
          <button className="win-btn win-btn-close" onClick={handleClose} title="Close">&#10005;</button>
        </div>
      </div>
    </header>
  );
};
