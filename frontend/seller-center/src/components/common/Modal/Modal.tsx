import React, { ReactNode } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidth?: string;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, maxWidth = '500px' }) => {
  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
      backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex', justifyContent: 'center',
      alignItems: 'center', zIndex: 1000
    }}>
      <div style={{
        backgroundColor: '#fff', borderRadius: '8px', padding: '24px', width: '100%',
        maxWidth, boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{title}</h2>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', lineHeight: 1
          }}>&times;</button>
        </div>
        <div>
          {children}
        </div>
      </div>
    </div>
  );
};
