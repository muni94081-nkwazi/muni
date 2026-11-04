import React, { useEffect, useState } from 'react';
// Assuming uiSlice has a toast state or similar. We'll mock it if not present.
// Since we might not have access to exact uiSlice, we'll implement a simple self-contained toast for now that can be triggered globally.

export const Toast: React.FC = () => {
  // Replace with Redux state if uiSlice supports it
  const [toast, setToast] = useState<{ message: string, type: 'success'|'error' } | null>(null);

  useEffect(() => {
    // Listen for custom event
    const handleToast = (e: any) => setToast(e.detail);
    window.addEventListener('showToast', handleToast);
    return () => window.removeEventListener('showToast', handleToast);
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  if (!toast) return null;

  return (
    <div style={{
      position: 'fixed', bottom: '24px', right: '24px',
      backgroundColor: toast.type === 'error' ? 'var(--color-danger)' : 'var(--color-success)',
      color: '#fff', padding: '12px 24px', borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-lg)', zIndex: 9999, transition: 'all 0.3s'
    }}>
      {toast.message}
    </div>
  );
};
