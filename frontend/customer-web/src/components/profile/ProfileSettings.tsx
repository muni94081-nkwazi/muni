import { useState, type FormEvent } from 'react';
import { useAppSelector } from '@/store/hooks/useAppSelector';
import { Button } from '@/components/common/Button/Button';

export function ProfileSettings() {
  const user = useAppSelector((state) => state.auth.user);
  const [name, setName] = useState(user?.fullName ?? '');
  const [phone, setPhone] = useState(user?.phoneNumber ?? '');
  const [saved, setSaved] = useState(false);

  function handleSave(e: FormEvent) {
    e.preventDefault();
    // In a real app, dispatch updateProfile action
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <form onSubmit={handleSave}>
      <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, marginBottom: 'var(--space-4)' }}>Account Settings</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxWidth: 480 }}>
        <div>
          <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Full name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%', padding: 'var(--space-2) var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-sm)' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Phone number</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+256 700 000000" style={{ width: '100%', padding: 'var(--space-2) var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-sm)' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>Email</label>
          <input value={user?.email ?? ''} disabled style={{ width: '100%', padding: 'var(--space-2) var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-sm)', background: 'var(--color-surface-muted)', color: 'var(--color-text-muted)' }} />
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 'var(--space-1)' }}>Contact support to change your email address.</p>
        </div>
        <div>
          <Button type="submit">{saved ? '✓ Saved!' : 'Save changes'}</Button>
        </div>
      </div>
    </form>
  );
}
