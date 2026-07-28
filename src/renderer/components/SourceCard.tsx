import React from 'react';
import { DesktopSource } from '../../sdk';

interface SourceCardProps {
  source: DesktopSource;
  isSelected: boolean;
  onSelect: (sourceId: string) => void;
}

export const SourceCard: React.FC<SourceCardProps> = ({ source, isSelected, onSelect }) => {
  const isScreen = source.id.startsWith('screen');

  return (
    <div
      className={`source-card ${isSelected ? 'selected' : ''}`}
      onClick={() => onSelect(source.id)}
    >
      <div className="source-badge">{isScreen ? 'SCREEN' : 'APP'}</div>

      {source.thumbnail ? (
        <img src={source.thumbnail} alt={source.name} />
      ) : (
        <div style={{
          width: '100%',
          height: '60px',
          background: 'rgba(99,102,241,0.25)',
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.3rem',
        }}>
          {isScreen ? '🖥️' : '🗔'}
        </div>
      )}

      <span title={source.name}>{source.name || 'Display Source'}</span>
    </div>
  );
};
