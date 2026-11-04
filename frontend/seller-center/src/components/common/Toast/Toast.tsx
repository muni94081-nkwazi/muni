import React, { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../../store/rootReducer';
import { hideToast } from '../../../store/slices/uiSlice';

export const Toast: React.FC = () => {
  const toasts = useSelector((state: RootState) => state.ui.toasts);
  const dispatch = useDispatch();

  return (
    <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onClose={() => dispatch(hideToast(toast.id))} />
      ))}
    </div>
  );
};

const ToastItem: React.FC<{ toast: any; onClose: () => void }> = ({ toast, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const colors = {
    success: { bg: '#e6f4ea', color: '#137333', border: '#ceead6' },
    error: { bg: '#fce8e6', color: '#c5221f', border: '#fad2cf' },
    info: { bg: '#e8f0fe', color: '#1967d2', border: '#d2e3fc' },
  };
  const style = colors[toast.type as keyof typeof colors];

  return (
    <div style={{
      backgroundColor: style.bg, color: style.color, border: `1px solid ${style.border}`,
      padding: '12px 24px', borderRadius: '4px', boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', minWidth: '250px'
    }}>
      <span>{toast.message}</span>
      <button onClick={onClose} style={{
        background: 'none', border: 'none', color: style.color, cursor: 'pointer', fontSize: '1.25rem', marginLeft: '16px'
      }}>&times;</button>
    </div>
  );
};
