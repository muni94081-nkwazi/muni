import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useSocialSignIn } from '@/hooks/useSocialSignIn';
import { isRequired, isValidEmail } from '@/utils/validators';
import { errorMessage } from '@/utils/helpers';
import {
  AppleIcon,
  AuthCard,
  AuthField,
  AuthHeading,
  FacebookIcon,
  FormError,
  GoogleIcon,
  INK,
  LINK,
  OrDivider,
  OutlinePillLink,
  PasswordField,
  PrimaryPill,
  SocialButton,
} from './AuthUI';

/**
 * Sign in — a flat page on white: heading, the "New here?" prompt with its
 * outlined Create account pill, one field, the primary pill, then the three
 * providers stacked under an "or" rule.
 *
 * The two-step shape is unchanged: Continue validates the address and reveals
 * the password field, and only the second submit calls login().
 */
export function LoginForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/dashboard';
  const { login } = useAuth();
  const { start: startSocialSignIn, isUnavailable } = useSocialSignIn();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!isValidEmail(email)) next.email = 'Enter a valid email address';
    if (showPassword && !isRequired(password)) next.password = 'Password is required';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleContinue(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!isValidEmail(email)) {
      setErrors({ email: 'Enter a valid email address' });
      return;
    }
    setErrors({});
    setShowPassword(true);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const outcome = await login({ email, password });

      // A correct password is not always a session. Sellers, admins and super
      // admins are required to carry a second factor, so auth-service answers
      // them with a challenge — which has to be routed, not treated as success.
      if (outcome.status === 'MFA_REQUIRED') {
        navigate('/auth/2fa/challenge', {
          replace: true,
          state: { challengeToken: outcome.challengeToken, redirectTo },
        });
        return;
      }
      if (outcome.status === 'MFA_ENROLLMENT_REQUIRED') {
        navigate('/auth/2fa/challenge', {
          replace: true,
          state: { enrollmentToken: outcome.enrollmentToken, redirectTo },
        });
        return;
      }

      navigate(redirectTo);
    } catch (error) {
      setFormError(errorMessage(error, 'Please check your information and try again.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  // Hands the window to auth-service's provider init URL; the session comes
  // back through /auth/callback, so there is nothing to await or navigate here.
  function handleSocial(provider: 'google' | 'apple' | 'facebook') {
    setFormError(null);
    void startSocialSignIn(provider);
  }

  return (
    <AuthCard onSubmit={showPassword ? handleSubmit : handleContinue}>
      <AuthHeading>Sign in to your account</AuthHeading>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-6)',
        }}
      >
        <span style={{ fontSize: 16, fontWeight: 700, color: INK }}>New here?</span>
        <OutlinePillLink to="/register">Create account</OutlinePillLink>
      </div>

      {formError && <FormError message={formError} />}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <AuthField
          label="Email or username"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={errors.email}
          disabled={showPassword}
          required
        />

        {showPassword && (
          <PasswordField
            label="Password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={errors.password}
            autoFocus
            required
          />
        )}

        <PrimaryPill isLoading={isSubmitting}>{showPassword ? 'Sign in' : 'Continue'}</PrimaryPill>

        {/* /forgot-password has always been routed, but nothing linked to it —
            so a shopper who could not remember their password had no way
            forward on the web at all. Shown on the password step, where the
            need actually arises, matching mobile's placement. */}
        {showPassword && (
          <Link
            to="/forgot-password"
            style={{ alignSelf: 'center', fontSize: 15, fontWeight: 600, color: LINK }}
          >
            Forgot password?
          </Link>
        )}
      </div>

      {!showPassword && (
        <>
          <OrDivider />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <SocialButton icon={<GoogleIcon />} label="Continue with Google" unavailable={isUnavailable('google')} onClick={() => handleSocial('google')} />
            <SocialButton icon={<AppleIcon />} label="Continue with Apple" unavailable={isUnavailable('apple')} onClick={() => handleSocial('apple')} />
            <SocialButton icon={<FacebookIcon />} label="Continue with Facebook" unavailable={isUnavailable('facebook')} onClick={() => handleSocial('facebook')} />
          </div>
        </>
      )}

      {/* There was a "Stay signed in" checkbox here. It was wired to local state
          and nothing else — unchecking it changed no token lifetime, no cookie
          and no request, so a shopper on a shared computer who deliberately
          unticked it got exactly the same 30-day session as everyone else.
          A control that lies about a security choice is worse than no control.

          Implementing it properly is a backend change, not a frontend one: the
          refresh token's 30-day expiry and the cookie's maxAge are both issued
          by auth-service (see buildAuthResponse and REFRESH_COOKIE_MAX_AGE_MS),
          so honouring "don't stay signed in" means login accepting the
          preference and issuing a session cookie instead. Worth doing; not
          worth faking until then. */}
    </AuthCard>
  );
}
