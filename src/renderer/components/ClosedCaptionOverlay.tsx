import React, { useEffect, useState } from 'react';
import { eventBus } from '../../shared/EventBus';

export const ClosedCaptionOverlay: React.FC = () => {
  const [captionText, setCaptionText] = useState<string>('');
  const [speaker, setSpeaker] = useState<'local' | 'remote'>('remote');
  const [isFinal, setIsFinal] = useState<boolean>(false);
  const [isVisible, setIsVisible] = useState<boolean>(false);

  useEffect(() => {
    let fadeTimer: NodeJS.Timeout | null = null;

    const handleCaptionUpdate = (text: string, spk: 'local' | 'remote' = 'remote', final: boolean = false) => {
      if (!text || text.trim().length === 0) return;

      setCaptionText(text.trim());
      setSpeaker(spk);
      setIsFinal(final);
      setIsVisible(true);

      if (fadeTimer) clearTimeout(fadeTimer);
      fadeTimer = setTimeout(() => {
        setIsVisible(false);
      }, 4500);
    };

    // 1. Listen to Preload IPC channel (relayed from Main process Whisper STT)
    let unsubIpc: (() => void) | undefined;
    const win = typeof window !== 'undefined' ? (window as any) : null;
    const onTranscript = win?.electronAPI?.onTranscript || win?.api?.onTranscript;
    if (onTranscript) {
      onTranscript((data: any) => {
        handleCaptionUpdate(data.text, data.speaker || 'remote', data.isFinal);
      });
    }


    // 2. Listen to EventBus local transcript events
    const unsubPartial = eventBus.on('transcript.partial', (evt) => {
      handleCaptionUpdate(evt.text, evt.speaker || 'local', false);
    });

    const unsubFinal = eventBus.on('transcript.final', (evt) => {
      handleCaptionUpdate(evt.text, evt.speaker || 'local', true);
    });

    // 3. Listen to DataChannel P2P closed captions from remote peers
    const unsubCc = eventBus.on('closed_caption', (evt) => {
      handleCaptionUpdate(evt.text, evt.speaker === 'Me' ? 'local' : 'remote', evt.isFinal);
    });

    return () => {
      if (unsubIpc) unsubIpc();
      unsubPartial();
      unsubFinal();
      unsubCc();
      if (fadeTimer) clearTimeout(fadeTimer);
    };
  }, []);

  if (!isVisible || !captionText) return null;

  return (
    <div className="absolute bottom-16 left-1/2 -translate-x-1/2 max-w-3xl w-11/12 px-6 py-3 rounded-2xl bg-black/85 backdrop-blur-md border border-white/20 shadow-2xl text-center pointer-events-none z-40 transition-all duration-200 animate-in fade-in slide-in-from-bottom-2">
      <div className="flex items-center justify-center gap-2 mb-1">
        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-500/30 text-indigo-300 border border-indigo-400/40 uppercase tracking-widest">
          CC
        </span>
        <span
          className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded border ${
            speaker === 'remote'
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
              : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
          }`}
        >
          {speaker === 'remote' ? '🔊 Speaker' : '🎙️ Me'}
        </span>
        {!isFinal && (
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
        )}
      </div>
      <p className="text-sm md:text-base font-semibold text-white tracking-wide leading-relaxed drop-shadow-md">
        "{captionText}"
      </p>
    </div>
  );
};
