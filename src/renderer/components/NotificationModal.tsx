import React from 'react';

interface NotificationModalProps {
  isOpen: boolean;
  title?: string;
  message: string;
  onClose: () => void;
}

export const NotificationModal: React.FC<NotificationModalProps> = ({
  isOpen,
  title = 'Notice',
  message,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <div className="modal-header">
          <div className="modal-icon">ℹ️</div>
          <div className="modal-title">{title}</div>
        </div>

        <div className="modal-body">{message}</div>

        <div className="modal-footer">
          <button className="btn" style={{ width: 'auto', padding: '7px 24px', fontSize: '0.85rem' }} onClick={onClose}>
            Got It
          </button>
        </div>
      </div>
    </div>
  );
};
