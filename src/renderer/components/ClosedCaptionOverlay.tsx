import React, { useEffect, useState } from 'react';
import { eventBus } from '../../shared/EventBus';

export const ClosedCaptionOverlay: React.FC = () => {
  const [captionText, setCaptionText] = useState<string>('');
  const [speaker, setSpeaker] = useState<string>('');
  const [isFinal, setIsFinal] = useState<boolean>(false);
  const [isVisible, setIsVisible] = useState<boolean>(false);

  useEffect(() => {
    let timer: any = null;

    const unsub = eventBus.on('closed_caption', (evt) => {
      setCaptionText(evt.text);
      setSpeaker(evt.speaker);
      setIsFinal(evt.isFinal);
      setIsVisible(true);

      // Auto-hide caption after 4 seconds of silence
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        setIsVisible(false);
      }, 4000);
    });

    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!isVisible || !captionText) return null;

  return (
    <div className="closed-caption-banner">
      <span className="cc-badge">CC</span>
      <span className="cc-speaker">{speaker}:</span>
      <span className={`cc-text ${isFinal ? 'cc-final' : 'cc-partial'}`}>
        {captionText}
      </span>
    </div>
  );
};
