import type { User } from '@/types/user.types';

interface Props { user: User; }

export function ProfileInfo({ user }: Props) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-5)', padding: 'var(--space-5)', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
      <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--color-nav-bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--text-2xl)', color: '#fff', fontWeight: 700, flexShrink: 0 }}>
        {user.fullName?.charAt(0).toUpperCase() ?? user.email.charAt(0).toUpperCase()}
      </div>
      <div>
        <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: 'var(--space-1)' }}>{user.fullName ?? 'Guest'}</h2>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>{user.email}</p>
        {user.phoneNumber && <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>{user.phoneNumber}</p>}
      </div>
    </div>
  );
}
