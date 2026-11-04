import { Link, Outlet } from 'react-router-dom';
import { ToastContainer } from '@/components/common/ToastContainer';

// A plain white page, not a tinted ground with a card floating on it: the
// sign-in and create-account forms sit directly on the background, so this
// layout only supplies the wordmark and the centred column.
export function AuthLayout() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-surface, #ffffff)',
      }}
    >
      <div style={{ padding: 'var(--space-5)' }}>
        <Link
          to="/"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 'var(--text-2xl)',
            color: 'var(--color-ink, #0f1111)',
          }}
        >
          Muni<span style={{ color: 'var(--color-primary-dark, #e47911)' }}>.</span>
        </Link>
      </div>

      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--space-5)',
        }}
      >
        <Outlet />
      </div>

      {/* The auth pages are outside MainLayout, which is where the rest of the
          app mounts this — without it the "provider unavailable" toast would
          be dispatched into a page that renders no toasts. */}
      <ToastContainer />
    </div>
  );
}
