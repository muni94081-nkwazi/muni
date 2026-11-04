import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ROUTES } from '../router/routes';
import { Button } from '../components/common/Button/Button';
import { Input } from '../components/common/Input/Input';
import { useAppDispatch } from '../store/hooks/useAppSelector';
import { sessionEstablished } from '../store/slices/authSlice';
import { mfaApi } from '../api/mfa.api';

// ─── Second leg of login ──────────────────────────────────────────────────────
//
// For an account that already has a second factor, /auth/login returns
// MFA_REQUIRED and a five-minute `verify` challenge token instead of a session.
// Exchanging that token plus a 6-digit code for the real token pair is what
// actually signs the user in.
//
// Like the setup page, the challenge token travels in router state rather than
// localStorage — it is a credential for one call, not something to keep.

export const MfaChallengePage: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const location = useLocation();
  const challengeToken = (location.state as { challengeToken?: string } | null)?.challengeToken;

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || !challengeToken) return;

    setSubmitting(true);
    setError(null);
    try {
      const result = await mfaApi.authenticate(challengeToken, code.trim());
      dispatch(sessionEstablished(result));
      // The role decides the landing page, exactly as a password-only login does.
      navigate(result.user.roles.includes('ROLE_SELLER') ? ROUTES.DASHBOARD : ROUTES.APPLY, { replace: true });
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response?.status;
      if (status === 401) {
        setError('This sign-in attempt has expired. Please sign in again.');
      } else if (status === 429) {
        setError('Too many attempts. Wait a moment and try again.');
      } else {
        setError('That code was not accepted. Check your authenticator and try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const shell = (children: React.ReactNode) => (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundColor: 'var(--color-sidebar-bg)', padding: 'var(--spacing-6) var(--spacing-4)',
    }}>
      <div style={{
        width: '100%', maxWidth: 420, backgroundColor: 'var(--color-surface)',
        padding: 'var(--spacing-8)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)',
      }}>
        {children}
      </div>
    </div>
  );

  if (!challengeToken) {
    return shell(
      <>
        <h2 style={{ marginBottom: 'var(--spacing-2)' }}>Two-factor verification</h2>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginBottom: 'var(--spacing-6)' }}>
          Start by signing in — MUNI will ask for your code straight after.
        </p>
        <Button fullWidth onClick={() => navigate(ROUTES.LOGIN, { replace: true })}>Go to sign in</Button>
      </>,
    );
  }

  return shell(
    <>
      <h2 style={{ marginBottom: 'var(--spacing-2)' }}>Enter your code</h2>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginBottom: 'var(--spacing-6)' }}>
        Open your authenticator app and enter the current 6-digit code for MUNI.
      </p>
      <form onSubmit={submit} noValidate>
        <Input
          label="6-digit code" value={code} onChange={(e) => setCode(e.target.value)}
          inputMode="numeric" autoComplete="one-time-code" maxLength={6} required
        />
        {error && (
          <p role="alert" style={{ color: 'var(--color-danger, #c53030)', fontSize: '0.85rem', marginBottom: 'var(--spacing-3)' }}>
            {error}
          </p>
        )}
        <Button type="submit" fullWidth isLoading={submitting} disabled={submitting}>
          {submitting ? 'Verifying…' : 'Verify and sign in'}
        </Button>
      </form>
    </>,
  );
};

export default MfaChallengePage;
