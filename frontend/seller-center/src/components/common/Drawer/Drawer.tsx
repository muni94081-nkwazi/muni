import React, { ReactNode, useEffect } from 'react';

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  side?: 'left' | 'right';
  width?: string;
  footer?: ReactNode;
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
        position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        justifyContent: side === 'right' ? 'flex-end' : 'flex-start',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#fff',
          width: '100%',
          maxWidth: width,
          height: '100%',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
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
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', lineHeight: 1 }}>&times;</button>
        </div>
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {children}
        </div>
        {footer && (
          <div style={{ padding: '16px 24px', borderTop: '1px solid var(--color-border)', flexShrink: 0 }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
