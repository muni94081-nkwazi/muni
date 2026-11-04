import React, { useEffect } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, maxWidth = '500px' }) => {
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div 
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
        padding: 'var(--space-4)'
      }}
      onClick={onClose}
    >
      <div 
        style={{
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--radius-lg)',
          width: '100%',
          maxWidth,
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh'
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ 
          padding: 'var(--space-4)', 
          borderBottom: '1px solid var(--color-border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>{title}</h2>
          <button 
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px' }}
          >
            ×
          </button>
        </div>
        <div style={{ padding: 'var(--space-4)', overflowY: 'auto' }}>
          {children}
        </div>
      </div>
    </div>
  );
};
