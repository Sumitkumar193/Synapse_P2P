import React, { useState, useRef, useEffect } from 'react';
import { useAppStore, ChatMessage, TranscriptParagraph } from '../store/useAppStore';
import { eventBus } from '../../shared/EventBus';
import { localAudioStreamer } from '../utils/AudioStreamer';

interface SideDrawerProps {
  onSendMessage: (text: string) => void;
  onSendFile: (file: File) => void;
  onSyncClipboard: (text: string) => void;
  onClose: () => void;
}

function parseInlineMarkdown(text: string): React.ReactNode[] {
  const regex = /(\*\*.*?\*\*|\*.*?\*|`.*?`)/g;
  const tokens = text.split(regex);

  return tokens.map((token, idx) => {
    if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
      return <strong key={idx} style={{ color: '#f8fafc', fontWeight: 700 }}>{token.slice(2, -2)}</strong>;
    }
    if (token.startsWith('*') && token.endsWith('*') && token.length > 2) {
      return <em key={idx} style={{ color: '#cbd5e1' }}>{token.slice(1, -1)}</em>;
    }
    if (token.startsWith('`') && token.endsWith('`') && token.length > 2) {
      return (
        <code key={idx} style={{
          background: 'rgba(99, 102, 241, 0.18)',
          border: '1px solid rgba(129, 140, 248, 0.3)',
          color: '#a5b4fc',
          padding: '1px 6px',
          borderRadius: '4px',
          fontFamily: 'Consolas, Monaco, monospace',
          fontSize: '0.85em',
        }}>
          {token.slice(1, -1)}
        </code>
      );
    }
    return token;
  });
}

function renderMarkdown(text: string): React.ReactNode {
  if (!text) return null;

  const parts = text.split(/(```[\s\S]*?```)/g);

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('```') && part.endsWith('```')) {
          const content = part.slice(3, -3).trim();
          const lines = content.split('\n');
          const firstLine = lines[0].trim();
          const hasLang = /^[a-zA-Z0-9_-]+$/.test(firstLine);
          const language = hasLang ? firstLine : '';
          const codeText = hasLang ? lines.slice(1).join('\n') : lines.join('\n');

          return (
            <div key={i} style={{
              margin: '8px 0',
              background: '#090d16',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '6px',
              overflow: 'hidden',
              fontFamily: 'Consolas, Monaco, monospace',
              fontSize: '0.82rem',
            }}>
              {language && (
                <div style={{
                  padding: '4px 10px',
                  background: 'rgba(255, 255, 255, 0.06)',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                  fontSize: '0.7rem',
                  color: '#818cf8',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                }}>
                  {language}
                </div>
              )}
              <pre style={{ margin: 0, padding: '10px 12px', overflowX: 'auto', color: '#e2e8f0', whiteSpace: 'pre-wrap' }}>
                <code>{codeText}</code>
              </pre>
            </div>
          );
        }

        const lines = part.split('\n');
        return (
          <span key={i}>
            {lines.map((line, lineIdx) => {
              if (/^#{1,3}\s/.test(line)) {
                const level = line.match(/^#{1,3}/)![0].length;
                const title = line.replace(/^#{1,3}\s/, '');
                const fontSize = level === 1 ? '1.05rem' : level === 2 ? '0.98rem' : '0.92rem';
                return (
                  <div key={lineIdx} style={{ fontSize, fontWeight: 700, color: '#f8fafc', margin: '8px 0 4px 0' }}>
                    {parseInlineMarkdown(title)}
                  </div>
                );
              }

              if (/^\s*[-*]\s/.test(line)) {
                const bulletText = line.replace(/^\s*[-*]\s/, '');
                return (
                  <div key={lineIdx} style={{ display: 'flex', gap: '6px', margin: '3px 0 3px 6px' }}>
                    <span style={{ color: '#818cf8', fontWeight: 700 }}>•</span>
                    <span>{parseInlineMarkdown(bulletText)}</span>
                  </div>
                );
              }

              return (
                <React.Fragment key={lineIdx}>
                  {parseInlineMarkdown(line)}
                  {lineIdx < lines.length - 1 && <br />}
                </React.Fragment>
              );
            })}
          </span>
        );
      })}
    </>
  );
}

export const SideDrawer: React.FC<SideDrawerProps> = ({
  onSendMessage,
  onSendFile,
  onSyncClipboard,
  onClose,
}) => {
  const chatMessages = useAppStore((state) => state.chatMessages);
  const addChatMessage = useAppStore((state) => state.addChatMessage);
  const transcripts = useAppStore((state) => state.transcripts);
  const addTranscriptParagraph = useAppStore((state) => state.addTranscriptParagraph);

  const lockCurrentParagraph = useAppStore((state) => state.lockCurrentParagraph);
  const clearTranscripts = useAppStore((state) => state.clearTranscripts);
  const selectedMicId = useAppStore((state) => state.selectedMicId);


  const [activeTab, setActiveTab] = useState<'transcripts' | 'chat'>('transcripts');
  const [inputMessage, setInputMessage] = useState<string>('');


  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const transcriptBottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, activeTab]);

  useEffect(() => {
    transcriptBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts, activeTab]);


  // Listen for transcript events and append clean paragraphs to persistent App Store
  useEffect(() => {
    const handleTranscript = (evt: { text: string; speaker?: 'local' | 'remote'; isFinal?: boolean; timestamp?: number }) => {
      const text = evt.text ? evt.text.trim() : '';
      if (!text) return;

      // Filter out Whisper decoder silence/hallucination tokens ("you", "thank you", "bye")
      const lowerNorm = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
      const hallucinationTokens = new Set([
        'you',
        'thank you',
        'thanks',
        'thanks for watching',
        'subscribe',
        'subtitles',
        'subtitles by',
        'amaraorg',
        'mb',
        'bye',
      ]);

      if (hallucinationTokens.has(lowerNorm) || lowerNorm.length <= 1) {
        return;
      }

      const speaker = evt.speaker || 'remote';
      const timestamp = evt.timestamp || Date.now();

      addTranscriptParagraph({
        id: Date.now().toString() + Math.random().toString().substring(2, 6),
        speaker,
        text,
        isFinal: !!evt.isFinal,
        timestamp,
      });
    };


    // 1. Listen to EventBus local transcript events, P2P closed captions & silence breaks
    const unsubPartial = eventBus.on('transcript.partial', (evt) => handleTranscript({ ...evt, isFinal: false }));
    const unsubFinal = eventBus.on('transcript.final', (evt) => handleTranscript({ ...evt, isFinal: true }));

    const unsubCc = eventBus.on('closed_caption', (evt) => {
      handleTranscript({
        text: evt.text,
        speaker: evt.speaker === 'Me' ? 'local' : 'remote',
        isFinal: evt.isFinal,
        timestamp: evt.timestamp,
      });
    });
    const unsubPause = eventBus.on('transcript.pause', () => {
      lockCurrentParagraph();
    });

    const unsubChat = eventBus.on('chat_received', (evt) => {
      console.log('[React Chat UI ⚛️] Rendering chat message in Zustand Store / SideDrawer:', evt.text?.substring(0, 60));
      addChatMessage({
        id: evt.id,
        sender: evt.isAi ? 'remote' : 'local',
        kind: 'text',
        text: `[${evt.sender}]: ${evt.text}`,
        timestamp: evt.timestamp,
      });
    });



    return () => {
      unsubPartial();
      unsubFinal();
      unsubCc();
      unsubPause();
      unsubChat();
    };
  }, [addTranscriptParagraph, addChatMessage]);


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
    navigator.clipboard
      .readText()
      .then((text) => {
        if (text.trim()) {
          onSyncClipboard(text.trim());
        } else {
          alert('Your OS clipboard is empty!');
        }
      })
      .catch(() => {
        const manual = prompt('Enter text to sync with remote clipboard:');
        if (manual && manual.trim()) {
          onSyncClipboard(manual.trim());
        }
      });
  };

  const handleCopySnippet = (text: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => alert('Copied snippet to clipboard!'))
      .catch(console.error);
  };

  const handleCopyAllTranscripts = () => {

    if (transcripts.length === 0) {
      alert('No transcripts recorded yet!');
      return;
    }
    const fullDoc = transcripts
      .map((t) => `[${new Date(t.timestamp).toLocaleTimeString()}] ${t.speaker === 'remote' ? 'Speaker' : 'Me'}: ${t.text}`)
      .join('\n\n');

    navigator.clipboard
      .writeText(fullDoc)
      .then(() => alert('📋 Copied entire transcript log to your clipboard!'))
      .catch(console.error);
  };

  const isAiHelperActive = useAppStore((state) => state.isAiHelperActive);
  const setIsAiHelperActive = useAppStore((state) => state.setIsAiHelperActive);

  const handleToggleListening = async () => {
    if (isAiHelperActive) {
      localAudioStreamer.stop();
      setIsAiHelperActive(false);
    } else {
      try {
        const audioTracks: MediaStreamTrack[] = [];

        // 1. Microphone Audio (User Voice)
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
            console.log(`[AI Drawer] 🎤 Captured Microphone: ${track.label}`);
            audioTracks.push(track);
          });
        } catch (err) {
          console.warn('[AI Drawer] Mic capture skipped or denied:', err);
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
          console.warn('[AI Drawer] System speaker audio loopback skipped:', err);
        }

        if (audioTracks.length === 0) {
          alert('No audio sources (microphone or system speakers) were available.');
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

  return (
    <div className="side-drawer">
      <div className="drawer-header" style={{ flexDirection: 'column', gap: '8px', paddingBottom: '6px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div className="brand" style={{ gap: '8px' }}>
            <span style={{ fontSize: '1.1rem' }}>💬</span>
            <span className="brand-title" style={{ fontSize: '0.95rem' }}>
              P2P Media & Transcripts
            </span>
          </div>
          <button className="btn-close-drawer" onClick={onClose} title="Close Side Panel">
            ✕
          </button>
        </div>

        {/* TAB NAVIGATION HEADER */}
        <div className="tab-navigation-bar" style={{ display: 'flex', gap: '6px', width: '100%' }}>
          <button
            className={`tab-btn ${activeTab === 'transcripts' ? 'active' : ''}`}
            onClick={() => setActiveTab('transcripts')}
            style={{
              flex: 1,
              padding: '6px 10px',
              borderRadius: '6px',
              fontSize: '0.78rem',
              fontWeight: 700,
              border: '1px solid rgba(255,255,255,0.12)',
              background: activeTab === 'transcripts' ? 'rgba(99, 102, 241, 0.35)' : 'rgba(30, 41, 59, 0.6)',
              color: activeTab === 'transcripts' ? '#ffffff' : '#94a3b8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            📜 Transcriptions {transcripts.length > 0 ? `(${transcripts.length})` : ''}
          </button>
          <button
            className={`tab-btn ${activeTab === 'chat' ? 'active' : ''}`}
            onClick={() => setActiveTab('chat')}
            style={{
              flex: 1,
              padding: '6px 10px',
              borderRadius: '6px',
              fontSize: '0.78rem',
              fontWeight: 700,
              border: '1px solid rgba(255,255,255,0.12)',
              background: activeTab === 'chat' ? 'rgba(99, 102, 241, 0.35)' : 'rgba(30, 41, 59, 0.6)',
              color: activeTab === 'chat' ? '#ffffff' : '#94a3b8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            💬 Chat {chatMessages.length > 0 ? `(${chatMessages.length})` : ''}
          </button>
        </div>
      </div>

      <div className="drawer-content">
        {/* TAB 1: TRANSCRIBED PARAGRAPHS */}
        {activeTab === 'transcripts' && (
          <div className="chat-panel">
            {/* ACTION TOOLBAR FOR TRANSCRIPTS */}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'rgba(15, 23, 42, 0.6)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                📜 Speech History Log {isAiHelperActive && <span style={{ color: '#34d399', fontSize: '0.68rem' }}>● Live</span>}
              </span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  onClick={handleCopyAllTranscripts}
                  style={{ background: 'rgba(99, 102, 241, 0.2)', border: '1px solid rgba(129, 140, 248, 0.3)', color: '#818cf8', borderRadius: '4px', padding: '3px 8px', fontSize: '0.7rem', cursor: 'pointer', fontWeight: 600 }}
                  title="Copy complete transcript history to clipboard"
                >
                  📋 Copy Log
                </button>
                <button
                  onClick={clearTranscripts}
                  style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', borderRadius: '4px', padding: '3px 8px', fontSize: '0.7rem', cursor: 'pointer', fontWeight: 600 }}
                  title="Clear transcript history"
                >
                  🗑️ Clear
                </button>
              </div>
            </div>

            <div className="messages-list">
              {transcripts.length === 0 ? (
                <div className="empty-state" style={{ padding: '32px 16px', textAlign: 'center' }}>
                  <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '8px' }}>🎙️</span>
                  <h4 style={{ margin: '0 0 6px 0', fontSize: '0.95rem', color: '#f8fafc' }}>
                    {isAiHelperActive ? 'Transcribing Speech...' : 'Microphone Offline'}
                  </h4>
                  <p style={{ fontSize: '0.76rem', color: '#94a3b8', margin: '0 0 16px 0', lineHeight: 1.4 }}>
                    {isAiHelperActive
                      ? 'Speak into your microphone. Words will automatically append below.'
                      : 'Click below to start local Whisper STT speech transcription.'}
                  </p>
                  <button
                    onClick={handleToggleListening}
                    style={{
                      padding: '8px 18px',
                      borderRadius: '8px',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: isAiHelperActive ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(16, 185, 129, 0.4)',
                      background: isAiHelperActive ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                      color: isAiHelperActive ? '#f87171' : '#34d399',
                    }}
                  >
                    {isAiHelperActive ? '🔴 Pause Listening' : '▶️ Start Listening'}
                  </button>
                </div>
              ) : (
                <>
                  {transcripts.map((p) => (
                    <div
                      key={p.id}
                      className={`message-bubble ${p.speaker === 'local' ? 'local' : 'remote'} text`}
                      style={{
                        padding: '12px 14px',
                        marginBottom: '6px',
                        background: 'rgba(15, 23, 42, 0.85)',
                        borderLeft: p.speaker === 'remote' ? '3px solid #10b981' : '3px solid #6366f1',
                      }}
                    >
                      <div className="message-meta">
                        <span className="sender" style={{ color: p.speaker === 'remote' ? '#34d399' : '#818cf8', fontWeight: 700 }}>
                          {p.speaker === 'remote' ? '🔊 Speaker Paragraph' : '🎙️ My Speech'}
                        </span>
                        <span className="time">
                          {new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="message-text" style={{ fontSize: '0.9rem', lineHeight: '1.5', marginTop: '4px', color: '#f8fafc' }}>
                        {p.text}
                      </p>
                    </div>
                  ))}
                </>
              )}

              <div ref={transcriptBottomRef} />
            </div>
          </div>
        )}

        {/* TAB 2: CHAT MESSAGES & FILES */}
        {activeTab === 'chat' && (
          <div className="chat-panel">
            <div className="messages-list">
              {chatMessages.length === 0 ? (
                <div className="empty-state">
                  <span style={{ fontSize: '2rem' }}>💬</span>
                  <p style={{ marginTop: '8px' }}>No text messages or shared files yet.</p>
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

                    {msg.kind === 'text' && <div className="message-text">{renderMarkdown(msg.text || '')}</div>}

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
        )}
      </div>
    </div>
  );
};
