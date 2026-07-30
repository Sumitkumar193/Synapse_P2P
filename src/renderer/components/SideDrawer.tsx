import React, { useState, useRef, useEffect } from 'react';
import { useAppStore, ChatMessage } from '../store/useAppStore';

interface SideDrawerProps {
  onSendMessage: (text: string) => void;
  onSendFile: (file: File) => void;
  onSyncClipboard: (text: string) => void;
  onClose: () => void;
}

export const SideDrawer: React.FC<SideDrawerProps> = ({
  onSendMessage,
  onSendFile,
  onSyncClipboard,
  onClose,
}) => {
  const chatMessages = useAppStore((state) => state.chatMessages);
  const [inputMessage, setInputMessage] = useState<string>('');
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;
    onSendMessage(inputMessage.trim());
    setInputMessage('');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onSendFile(e.target.files[0]);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleQuickSyncClipboard = () => {
    navigator.clipboard.readText().then((text) => {
      if (text.trim()) {
        onSyncClipboard(text.trim());
      } else {
        alert('Your OS clipboard is empty!');
      }
    }).catch(() => {
      // Prompt fallback if browser blocks automatic clipboard read
      const manual = prompt('Enter text to sync with remote clipboard:');
      if (manual && manual.trim()) {
        onSyncClipboard(manual.trim());
      }
    });
  };

  const handleCopySnippet = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      alert('Copied snippet to your OS clipboard!');
    }).catch(console.error);
  };

  return (
    <div className="side-drawer">
      <div className="drawer-header">
        <div className="brand" style={{ gap: '8px' }}>
          <span style={{ fontSize: '1.1rem' }}>💬</span>
          <span className="brand-title" style={{ fontSize: '0.95rem' }}>
            Chat & Shared Media
          </span>
        </div>
        <button className="btn-close-drawer" onClick={onClose} title="Close Side Panel">
          ✕
        </button>
      </div>

      <div className="drawer-content">
        <div className="chat-panel">
          <div className="messages-list">
            {chatMessages.length === 0 ? (
              <div className="empty-state">
                <span style={{ fontSize: '2rem' }}>💬</span>
                <p style={{ marginTop: '8px' }}>No messages or shared files yet.</p>
                <p style={{ fontSize: '0.74rem', opacity: 0.7 }}>
                  Use the toolbar below to chat, attach files, or sync clipboards!
                </p>
              </div>
            ) : (
              chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`message-bubble ${msg.sender === 'local' ? 'local' : 'remote'} ${msg.kind}`}
                >
                  <div className="message-meta">
                    <span className="sender">
                      {msg.sender === 'local' ? 'You' : 'Remote Peer'}
                    </span>
                    <span className="time">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  {/* 1. TEXT MESSAGE */}
                  {msg.kind === 'text' && <div className="message-text">{msg.text}</div>}

                  {/* 2. INLINE FILE CARD */}
                  {msg.kind === 'file' && msg.fileData && (
                    <div className="inline-file-card">
                      <div className="file-icon">📄</div>
                      <div className="file-info">
                        <div className="file-name">{msg.fileData.name}</div>
                        <div className="file-meta">
                          {(msg.fileData.size / 1024).toFixed(1)} KB • {msg.fileData.isIncoming ? 'Received' : 'Sent'}
                        </div>
                        {msg.fileData.progress !== undefined && msg.fileData.progress < 100 && (
                          <div className="progress-bar-container">
                            <div
                              className="progress-bar-fill"
                              style={{ width: `${msg.fileData.progress}%` }}
                            />
                          </div>
                        )}
                      </div>
                      {msg.fileData.url && (
                        <a
                          href={msg.fileData.url}
                          download={msg.fileData.name}
                          className="btn-download-file"
                          title="Download File"
                        >
                          💾
                        </a>
                      )}
                    </div>
                  )}

                  {/* 3. INLINE CLIPBOARD SNIPPET */}
                  {msg.kind === 'clipboard' && msg.clipboardData && (
                    <div className="inline-clipboard-card">
                      <div className="clipboard-header-tag">📋 Shared Clipboard Snippet</div>
                      <div className="clipboard-text-snippet">{msg.clipboardData.text}</div>
                      <button
                        className="btn-copy-snippet"
                        onClick={() => handleCopySnippet(msg.clipboardData!.text)}
                      >
                        📋 Copy to My Clipboard
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* CHAT TOOLBAR & INPUT */}
          <div className="chat-action-bar">
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
            <button
              type="button"
              className="chat-action-btn"
              onClick={() => fileInputRef.current?.click()}
              title="Attach File to Send over WebRTC"
            >
              📎 File
            </button>
            <button
              type="button"
              className="chat-action-btn"
              onClick={handleQuickSyncClipboard}
              title="Sync OS Clipboard to Chat"
            >
              📋 Clipboard
            </button>
          </div>

          <form className="chat-input-form" onSubmit={handleSendChat}>
            <input
              type="text"
              className="chat-input"
              placeholder="Type a message or paste..."
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
            />
            <button type="submit" className="btn-send-chat">
              Send ➔
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
