import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks/useAppSelector';
import { dismissToast } from '@/store/slices/uiSlice';
import { classNames } from '@/utils/helpers';

const AUTO_DISMISS_MS = 4000;

export function ToastContainer() {
  const toasts = useAppSelector((state) => state.ui.toasts);
  const dispatch = useAppDispatch();

  useEffect(() => {
    const timers = toasts.map((toast) =>
      setTimeout(() => dispatch(dismissToast(toast.id)), AUTO_DISMISS_MS),
    );
    return () => timers.forEach(clearTimeout);
  }, [toasts, dispatch]);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 'var(--space-5)',
        right: 'var(--space-5)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        zIndex: 200,
      }}
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={classNames('toast', `toast--${toast.variant}`)}
          style={{
            padding: 'var(--space-3) var(--space-4)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-popover)',
            fontSize: 'var(--text-sm)',
            fontWeight: 500,
            color: '#fff',
            background:
              toast.variant === 'success'
                ? 'var(--color-success)'
                : toast.variant === 'error'
                  ? 'var(--color-terracotta)'
                  : 'var(--color-ink)',
            maxWidth: 320,
            cursor: 'pointer',
          }}
          onClick={() => dispatch(dismissToast(toast.id))}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
