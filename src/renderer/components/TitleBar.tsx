import React from 'react';

interface TitleBarProps {
  statusText: string;
  statusState: 'ready' | 'hosting' | 'connected' | 'expired';
  onOpen2ndWin: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({ statusText, statusState, onOpen2ndWin }) => {
  const handleMinimize = () => window.electronAPI?.minimizeWindow?.();
  const handleMaximize = () => window.electronAPI?.maximizeWindow?.();
  const handleClose = () => window.electronAPI?.closeWindow?.();

  return (
    <header>
      <div className="brand">
        <div className="brand-icon">P2P</div>
        <span className="brand-title">Screen Share</span>
      </div>

      <div className="header-right">
        <button
          className="btn-new-win"
          onClick={onOpen2ndWin}
          title="Launch a second window to test Host & Viewer on same computer"
        >
          ➕ Open 2nd Window (Test Viewer)
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
