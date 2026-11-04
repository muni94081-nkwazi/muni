import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppDispatch } from '@/store/hooks/useAppSelector';
import { establishSession } from '@/store/slices/authSlice';
import { authApi } from '@/api/auth.api';
import { errorMessage } from '@/utils/helpers';
import {
  AuthCard,
  AuthField,
  AuthHeading,
  FormError,
  INK,
  MUTED,
  PrimaryPill,
} from './AuthUI';

/**
 * The second leg of a login, for both ways of reaching it.
 *
 * A password sign-in arrives here via navigation state, carrying the challenge
 * token the login response returned. A social sign-in arrives as a redirect
 * from auth-service with the token in the query, because there is no React
 * navigation across that hop.
 *
 * Two outcomes are possible, and they are genuinely different:
 *
 *   MFA_REQUIRED            — a factor is enrolled; enter the current code.
 *   MFA_ENROLLMENT_REQUIRED — a privileged account (admin, super admin,
 *                             seller) has no factor yet. auth-service refuses
 *                             to issue tokens until one exists, and enrolment
 *                             itself needs an authenticated session to call
 *                             2fa/generate — which this account does not have.
 *                             So the honest thing is to say so and send them
 *                             somewhere it can be done, not to render a code
 *                             box that cannot succeed.
 *
 * This replaces components/profile/TwoFactorSetup.tsx, which has been deleted.
 * That component was a visual mock — its "Verify & Activate" button called no
 * API and flipped a local boolean — and it was imported nowhere. Wiring it into
 * a login would have produced a screen that appears to check a code and does
 * not, which is worse than having no screen at all.
 */
export function TwoFactorChallenge() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  // The password path passes these through router state; the OAuth redirect has
  // only the URL. Reading both means one screen serves both entry points.
  const historyState = (window.history.state?.usr ?? {}) as {
    challengeToken?: string;
    enrollmentToken?: string;
    redirectTo?: string;
  };

  const challengeToken = historyState.challengeToken ?? params.get('token') ?? '';
  const enrollmentToken = historyState.enrollmentToken ?? params.get('enrollment_token') ?? '';
  const redirectTo = historyState.redirectTo ?? '/dashboard';

  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Neither token present means this page was opened directly, or the challenge
  // has already been consumed. There is nothing to verify against, so send them
  // back rather than showing an input that will always fail.
  useEffect(() => {
    if (!challengeToken && !enrollmentToken) {
      navigate('/login', { replace: true });
    }
  }, [challengeToken, enrollmentToken, navigate]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const trimmed = code.trim();
    if (!/^\d{6}$/.test(trimmed)) {
      setFormError('Enter the 6-digit code from your authenticator app.');
      return;
    }

    setIsSubmitting(true);
    try {
      const session = await authApi.authenticate2FA(challengeToken, trimmed);
      await dispatch(establishSession(session)).unwrap();
      navigate(redirectTo, { replace: true });
    } catch (error) {
      // auth-service returns `attemptsRemaining` alongside a wrong code and 429
      // once the account is locked out; errorMessage surfaces whichever message
      // came back rather than flattening both to "invalid code".
      setFormError(errorMessage(error, 'That code was not accepted. Please try again.'));
      setCode('');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (enrollmentToken) {
    return (
      <div style={{ width: '100%', maxWidth: 420, margin: '0 auto' }}>
        <AuthHeading>Two-factor authentication required</AuthHeading>
        <p style={{ fontSize: 15, lineHeight: 1.6, color: INK, marginBottom: 'var(--space-4)' }}>
          This account can approve sellers, move money or read customer records, so it has to carry a
          second factor before it can sign in.
        </p>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: MUTED }}>
          Set one up from your account security settings on a device where you are already signed in,
          then come back here. If you cannot get in anywhere, contact an administrator.
        </p>
      </div>
    );
  }

  return (
    <AuthCard onSubmit={handleSubmit}>
      <AuthHeading>Enter your verification code</AuthHeading>

      <p style={{ fontSize: 15, lineHeight: 1.6, color: MUTED, marginBottom: 'var(--space-5)' }}>
        Open your authenticator app and enter the current 6-digit code for MUNI.
      </p>

      {formError && <FormError message={formError} />}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <AuthField
          label="6-digit code"
          // `inputMode` rather than type="number": a number input strips leading
          // zeros and shows spinners, and a TOTP code is a string of digits.
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
          autoFocus
          required
        />

        <PrimaryPill isLoading={isSubmitting}>Verify and sign in</PrimaryPill>
      </div>
    </AuthCard>
  );
}
