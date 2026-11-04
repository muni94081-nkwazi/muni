import { Link } from 'react-router-dom';
import { Button } from '@/components/common/Button/Button';

export function NotFoundPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: 'var(--space-6)',
      }}
    >
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-4xl)', color: 'var(--color-marigold-dark)', fontWeight: 700 }}>
        404
      </p>
      <h1 style={{ fontSize: 'var(--text-2xl)', marginBottom: 'var(--space-2)' }}>Page not found</h1>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-6)' }}>
        The page you're looking for doesn't exist or has moved.
      </p>
      <Link to="/">
        <Button>Back to home</Button>
      </Link>
    </div>
  );
}
