import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { ResumeRAGService, RetrievalResult } from '../../agent/rag/ResumeRAGService';

interface ResumeContextManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ResumeContextManager: React.FC<ResumeContextManagerProps> = ({ isOpen, onClose }) => {
  const ragService = ResumeRAGService.getInstance();
  const [resumeInput, setResumeInput] = useState<string>(ragService.getResumeText());
  const [chunkCount, setChunkCount] = useState<number>(ragService.getChunkCount());
  const [testQuery, setTestQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<RetrievalResult[]>([]);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  useEffect(() => {
    setResumeInput(ragService.getResumeText());
    setChunkCount(ragService.getChunkCount());
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSaveAndIndex = () => {
    if (!resumeInput.trim()) {
      setStatusNotice('⚠️ Resume text cannot be empty.');
      return;
    }
    ragService.persistResume(resumeInput.trim());
    setChunkCount(ragService.getChunkCount());
    setStatusNotice(`✅ Successfully indexed ${ragService.getChunkCount()} RAG vector chunks!`);
    setTimeout(() => setStatusNotice(null), 3500);
  };

  const handleTestSearch = () => {
    if (!testQuery.trim()) return;
    const results = ragService.search(testQuery, 4);
    setSearchResults(results);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf') {
      setStatusNotice(`🧠 Uploading "${file.name}" to AI for content-aware PDF extraction & RAG vector indexing...`);
      const reader = new FileReader();
      reader.onload = async (event) => {
        const arrayBuffer = event.target?.result as ArrayBuffer;
        if (!arrayBuffer) return;

        const base64Data = btoa(
          new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
        );

        try {
          if (typeof window !== 'undefined' && (window as any).electronAPI?.processPdfResume) {
            const res = await (window as any).electronAPI.processPdfResume(base64Data);
            if (res.success && res.text) {
              setResumeInput(res.text);
              ragService.persistResume(res.text);
              setChunkCount(ragService.getChunkCount());
              setStatusNotice(`✅ AI extracted & indexed ${ragService.getChunkCount()} content-aware RAG vector chunks from "${file.name}"!`);
              setTimeout(() => setStatusNotice(null), 4000);
            } else {
              setStatusNotice(`⚠️ AI PDF extraction notice: ${res.error || 'Could not extract PDF content.'}`);
            }
          } else {
            setStatusNotice('⚠️ PDF processing requires Electron environment.');
          }
        } catch (err: any) {
          setStatusNotice(`❌ Error processing PDF: ${err.message || err}`);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        if (content) {
          setResumeInput(content);
          ragService.persistResume(content);
          setChunkCount(ragService.getChunkCount());
          setStatusNotice(`📄 Loaded "${file.name}" & indexed ${ragService.getChunkCount()} RAG vector chunks!`);
          setTimeout(() => setStatusNotice(null), 3500);
        }
      };
      reader.readAsText(file);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(15, 23, 42, 0.82)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        style={{
          background: '#0f172a',
          border: '1px solid rgba(99, 102, 241, 0.3)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '820px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 30px rgba(99, 102, 241, 0.15)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(30, 41, 59, 0.5)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'rgba(99, 102, 241, 0.2)',
                color: '#818cf8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.3rem',
              }}
            >
              📄
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#f8fafc' }}>Resume Context & RAG Embeddings Manager</h3>
              <p style={{ margin: 0, fontSize: '0.78rem', color: '#94a3b8' }}>
                Pre-indexed RAG Vector Chunks: <strong style={{ color: '#38bdf8' }}>{chunkCount} chunks</strong>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '1.4rem',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '6px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {statusNotice && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                color: '#34d399',
                fontSize: '0.85rem',
                fontWeight: 600,
              }}
            >
              {statusNotice}
            </div>
          )}

          {/* Action Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <label
              style={{
                padding: '8px 14px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '8px',
                color: '#cbd5e1',
                fontSize: '0.82rem',
                cursor: 'pointer',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              📁 Upload Resume File (.pdf / .txt / .md)
              <input type="file" accept=".pdf,.txt,.md,.text" onChange={handleFileUpload} style={{ display: 'none' }} />
            </label>

            <button
              onClick={handleSaveAndIndex}
              style={{
                padding: '8px 18px',
                background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
              }}
            >
              ⚡ Re-Index Resume Vectors
            </button>
          </div>

          {/* Resume Text Area */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
              Candidate Resume Text (Pre-populated with Sumit Kumar's Resume):
            </label>
            <textarea
              value={resumeInput}
              onChange={(e) => setResumeInput(e.target.value)}
              rows={12}
              style={{
                width: '100%',
                background: '#090d16',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '10px',
                padding: '12px',
                color: '#e2e8f0',
                fontSize: '0.82rem',
                fontFamily: 'monospace',
                lineHeight: '1.45',
                resize: 'vertical',
                outline: 'none',
              }}
            />
          </div>

          {/* RAG Retrieval Tester */}
          <div
            style={{
              background: 'rgba(30, 41, 59, 0.4)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '12px',
              padding: '16px',
            }}
          >
            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#f8fafc', marginBottom: '8px' }}>
              🔍 Test RAG Retrieval Query
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={testQuery}
                onChange={(e) => setTestQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleTestSearch()}
                placeholder="Try: 'Tell me about yourself' or 'you mentioned 500k+ users'..."
                style={{
                  flex: 1,
                  background: '#090d16',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  color: '#fff',
                  fontSize: '0.82rem',
                  outline: 'none',
                }}
              />
              <button
                onClick={handleTestSearch}
                style={{
                  padding: '8px 14px',
                  background: 'rgba(56, 189, 248, 0.2)',
                  border: '1px solid rgba(56, 189, 248, 0.4)',
                  borderRadius: '8px',
                  color: '#38bdf8',
                  fontWeight: 600,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                }}
              >
                Search RAG
              </button>
            </div>

            {searchResults.length > 0 && (
              <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8' }}>
                  Retrieved Chunks ({searchResults.length}):
                </div>
                {searchResults.map((res, idx) => (
                  <div
                    key={res.chunk.id}
                    style={{
                      background: 'rgba(15, 23, 42, 0.7)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '8px',
                      padding: '10px',
                      fontSize: '0.78rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 700, color: '#a78bfa' }}>
                        #{idx + 1} {res.chunk.title} [{res.chunk.section}]
                      </span>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: res.matchType === 'summary_override' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                          color: res.matchType === 'summary_override' ? '#38bdf8' : '#34d399',
                        }}
                      >
                        Score: {(res.score * 100).toFixed(0)}% ({res.matchType})
                      </span>
                    </div>
                    <div style={{ color: '#cbd5e1', whiteSpace: 'pre-wrap', fontSize: '0.76rem', lineHeight: '1.4' }}>
                      {res.chunk.content.substring(0, 220)}...
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            background: 'rgba(30, 41, 59, 0.3)',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: '8px',
              color: '#f8fafc',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Done & Save
          </button>
        </div>
      </div>
    </div>
  );
};
