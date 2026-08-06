import React, { useEffect, useState } from 'react';
import { SignalingMethod, useAppStore } from '../store/useAppStore';
import { localAudioStreamer } from '../utils/AudioStreamer';

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
}

const CustomSelect = ({ 
  value, 
  onChange, 
  options, 
  title, 
  icon 
}: { 
  value: string; 
  onChange: (v: string) => void; 
  options: {value: string, label: string}[]; 
  title: string; 
  icon: string 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const selectedOption = options.find(o => o.value === value) || options[0];
  
  return (
    <div style={{ position: 'relative' }}>
      <button 
        className="btn-new-win"
        onClick={() => setIsOpen(!isOpen)}
        title={title}
        style={{
          background: isOpen ? 'rgba(99, 102, 241, 0.4)' : 'rgba(255, 255, 255, 0.1)',
          color: isOpen ? 'white' : '#f8fafc',
          borderColor: isOpen ? '#818cf8' : 'rgba(255, 255, 255, 0.2)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          maxWidth: '180px',
          padding: '4px 10px',
          fontSize: '12px',
        }}
      >
        <span>{icon}</span> 
        <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
          {selectedOption?.label}
        </span>
      </button>
      
      {isOpen && (
        <>
          <div 
            style={{ position: 'fixed', inset: 0, zIndex: 9998 }} 
            onClick={() => setIsOpen(false)} 
          />
          <div style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: '8px',
            background: '#0f172a',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '8px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.8)',
            zIndex: 9999,
            minWidth: '240px',
            maxWidth: '350px',
            maxHeight: '400px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            padding: '6px'
          }}>
            {options.map(o => (
              <div 
                key={o.value}
                onClick={() => { onChange(o.value); setIsOpen(false); }}
                title={o.label}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: o.value === value ? '#fff' : '#cbd5e1',
                  background: o.value === value ? 'rgba(99, 102, 241, 0.4)' : 'transparent',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
                onMouseEnter={(e) => { if (o.value !== value) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                onMouseLeave={(e) => { if (o.value !== value) e.currentTarget.style.background = 'transparent' }}
              >
                <span style={{ width: '12px', flexShrink: 0 }}>{o.value === value ? '✓' : ''}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export const TitleBar: React.FC<TitleBarProps> = ({
  statusText,
  statusState,
  chatBadgeCount = 0,
  isChatOpen = false,
  onToggleChat,
  onOpenSettings,
}) => {
  const isAiHelperActive = useAppStore((state) => state.isAiHelperActive);
  const setIsAiHelperActive = useAppStore((state) => state.setIsAiHelperActive);
  const selectedMicId = useAppStore((state) => state.selectedMicId);
  const setSelectedMicId = useAppStore((state) => state.setSelectedMicId);
  const selectedSpeakerId = useAppStore((state) => state.selectedSpeakerId);
  const setSelectedSpeakerId = useAppStore((state) => state.setSelectedSpeakerId);

  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [speakers, setSpeakers] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    const fetchDevices = async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true }); // Request permission to see labels
        const devices = await navigator.mediaDevices.enumerateDevices();
        setMics(devices.filter(d => d.kind === 'audioinput'));
        setSpeakers(devices.filter(d => d.kind === 'audiooutput'));
      } catch (err) {
        console.warn('Could not enumerate devices:', err);
      }
    };
    fetchDevices();
    navigator.mediaDevices.addEventListener('devicechange', fetchDevices);
    return () => navigator.mediaDevices.removeEventListener('devicechange', fetchDevices);
  }, []);

  const handleMinimize = () => window.electronAPI?.minimizeWindow?.();
  const handleMaximize = () => window.electronAPI?.maximizeWindow?.();
  const handleClose = () => window.electronAPI?.closeWindow?.();

  const handleToggleListening = async () => {
    if (isAiHelperActive) {
      localAudioStreamer.stop();
      setIsAiHelperActive(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
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
        const track = stream.getAudioTracks()[0];
        if (track) {
          console.log(`[TitleBar] 🎤 Captured Microphone: ${track.label}`);
        }
        await localAudioStreamer.start(stream, 'local');
        setIsAiHelperActive(true);
      } catch (err) {
        console.warn('Could not start mic listening:', err);
      }
    }
  };

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

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <CustomSelect
            title="Select Microphone"
            icon="🎤"
            value={selectedMicId}
            onChange={setSelectedMicId}
            options={[
              { value: '', label: 'Default Microphone' },
              ...mics.map(m => ({ value: m.deviceId, label: m.label || `Mic ${m.deviceId.substring(0,4)}` }))
            ]}
          />

          <CustomSelect
            title="Select Speaker"
            icon="🔈"
            value={selectedSpeakerId}
            onChange={setSelectedSpeakerId}
            options={[
              { value: 'default', label: 'Default Speaker' },
              ...speakers.map(s => ({ value: s.deviceId, label: s.label || `Speaker ${s.deviceId.substring(0,4)}` }))
            ]}
          />
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

        <div className="window-controls">
          <button className="win-btn" onClick={handleMinimize} title="Minimize">&#8722;</button>
          <button className="win-btn" onClick={handleMaximize} title="Maximize">&#9633;</button>
          <button className="win-btn win-btn-close" onClick={handleClose} title="Close">&#10005;</button>
        </div>
      </div>
    </header>
  );
};
