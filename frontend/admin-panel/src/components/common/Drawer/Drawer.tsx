import React, { useEffect } from 'react';

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  side?: 'left' | 'right';
  width?: string;
  footer?: React.ReactNode;
}

export const Drawer: React.FC<DrawerProps> = ({ isOpen, onClose, title, children, side = 'right', width = '480px', footer }) => {
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
        display: 'flex',
        justifyContent: side === 'right' ? 'flex-end' : 'flex-start',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'var(--color-surface)',
          width: '100%',
          maxWidth: width,
          height: '100%',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          flexDirection: 'column',
          animation: `${side === 'right' ? 'drawer-slide-in-right' : 'drawer-slide-in-left'} 0.2s ease-out`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <style>{`
          @keyframes drawer-slide-in-right { from { transform: translateX(100%); } to { transform: translateX(0); } }
          @keyframes drawer-slide-in-left { from { transform: translateX(-100%); } to { transform: translateX(0); } }
        `}</style>
        <div style={{
          padding: 'var(--space-4)',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexShrink: 0,
        }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px' }}>×</button>
        </div>
        <div style={{ padding: 'var(--space-4)', overflowY: 'auto', flex: 1 }}>
          {children}
        </div>
        {footer && (
          <div style={{ padding: 'var(--space-4)', borderTop: '1px solid var(--color-border)', flexShrink: 0 }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
