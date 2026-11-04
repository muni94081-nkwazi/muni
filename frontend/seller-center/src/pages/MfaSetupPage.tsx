import React, { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ROUTES } from '../router/routes';
import { Button } from '../components/common/Button/Button';
import { Input } from '../components/common/Input/Input';
import { mfaApi, type EnrolmentSecret } from '../api/mfa.api';

// ─── Mandatory two-factor setup ───────────────────────────────────────────────
//
// Where a newly-approved seller lands. auth-service refuses to issue them a
// session until a second factor exists, handing back an `enrol` token instead;
// this page spends that token on the two enrolment calls and nothing else.
//
// The token arrives in router state rather than localStorage. It is a
// five-minute credential, and the browser has no reason to keep it after the
// navigation that carries it — persisting it would leave an enrolment
// credential sitting in a profile long after it stopped being useful.
//
// On success the user is sent back to sign in: enrolment deliberately issues no
// session, so the normal login + code path is what actually starts one.

export const MfaSetupPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const enrollmentToken = (location.state as { enrollmentToken?: string } | null)?.enrollmentToken;

  const [secret, setSecret] = useState<EnrolmentSecret | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const begin = useCallback(async () => {
    if (!enrollmentToken) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      setSecret(await mfaApi.beginEnrolment(enrollmentToken));
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response?.status;
      setError(
        status === 401
          ? 'This setup link has expired. Please sign in again to restart two-factor setup.'
          : 'Could not start two-factor setup. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }, [enrollmentToken]);

  useEffect(() => { void begin(); }, [begin]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || !enrollmentToken) return;

    setSubmitting(true);
    setError(null);
    try {
      await mfaApi.completeEnrolment(enrollmentToken, code.trim());
      navigate(ROUTES.LOGIN, {
        replace: true,
        state: { mfaEnrolled: true },
      });
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response?.status;
      if (status === 401) {
        setError('This setup link has expired. Please sign in again to restart two-factor setup.');
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
        width: '100%', maxWidth: 480, backgroundColor: 'var(--color-surface)',
        padding: 'var(--spacing-8)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)',
      }}>
        {children}
      </div>
    </div>
  );

  // Reached directly, without the credential login hands over.
  if (!enrollmentToken) {
    return shell(
      <>
        <h2 style={{ marginBottom: 'var(--spacing-2)' }}>Two-factor setup</h2>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginBottom: 'var(--spacing-6)' }}>
          Start two-factor setup by signing in — MUNI will bring you straight back here.
        </p>
        <Button fullWidth onClick={() => navigate(ROUTES.LOGIN, { replace: true })}>Go to sign in</Button>
      </>,
    );
  }

  return shell(
    <>
      <h2 style={{ marginBottom: 'var(--spacing-2)' }}>Set up two-factor authentication</h2>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginBottom: 'var(--spacing-6)' }}>
        Seller accounts need a second factor before they can sign in. Add MUNI to an authenticator
        app such as Google Authenticator or Authy, then enter the 6-digit code it shows.
      </p>

      {loading && <p>Preparing your setup key…</p>}

      {secret && (
        <div style={{
          backgroundColor: 'var(--color-sidebar-bg)', padding: 'var(--spacing-4)',
          borderRadius: 'var(--radius-sm)', marginBottom: 'var(--spacing-5)',
        }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: 'var(--spacing-2)' }}>
            Enter this setup key in your authenticator app:
          </p>
          <code style={{
            display: 'block', wordBreak: 'break-all', fontSize: '0.95rem',
            fontWeight: 700, letterSpacing: '0.04em', marginBottom: 'var(--spacing-3)',
          }}>
            {secret.secret}
          </code>
          <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
            Keep this key private. Anyone holding it can generate your codes.
          </p>
        </div>
      )}

      {secret && (
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
            {submitting ? 'Verifying…' : 'Turn on two-factor authentication'}
          </Button>
        </form>
      )}

      {!secret && !loading && (
        <>
          {error && (
            <p role="alert" style={{ color: 'var(--color-danger, #c53030)', fontSize: '0.85rem', marginBottom: 'var(--spacing-3)' }}>
              {error}
            </p>
          )}
          <Button fullWidth onClick={() => navigate(ROUTES.LOGIN, { replace: true })}>Back to sign in</Button>
        </>
      )}
    </>,
  );
};

export default MfaSetupPage;
