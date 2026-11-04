import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useSocialSignIn } from '@/hooks/useSocialSignIn';
import { isRequired, isValidEmail, passwordStrengthMessage } from '@/utils/validators';
import { errorMessage } from '@/utils/helpers';
import {
  AppleIcon,
  AuthCard,
  AuthField,
  AuthHeading,
  FacebookIcon,
  FormError,
  GoogleIcon,
  LINK,
  MUTED,
  OrDivider,
  PasswordField,
  PrimaryPill,
  SocialButton,
} from './AuthUI';
import styles from './AuthUI.module.css';

/**
 * Create an account — the same flat page as sign-in: heading, the name pair
 * side by side, email, password with its eye toggle, the terms line, the
 * primary pill, then the three providers in a row under "or continue with".
 *
 * There is deliberately no Personal/Business toggle. The reference has one,
 * but /auth/register (registerSchema in backend/shared/validators) accepts
 * only firstName, lastName, email, phoneNumber and password — there is no
 * business signup behind it, and a toggle whose Business half submits a
 * personal account would be a lie in the UI. It belongs here the day the
 * backend grows an account type.
 */
export function RegisterForm() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const { start: startSocialSignIn, isUnavailable } = useSocialSignIn();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!isRequired(firstName)) next.firstName = 'First name is required';
    if (!isRequired(lastName)) next.lastName = 'Last name is required';
    if (!isValidEmail(email)) next.email = 'Enter a valid email address';
    const passwordIssue = passwordStrengthMessage(password);
    if (passwordIssue) next.password = passwordIssue;
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      await register({ firstName, lastName, email, password });
      navigate('/dashboard');
    } catch (error) {
      setFormError(errorMessage(error, 'Could not create your account. Please try again.'));
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

  const legalLink = { color: LINK, textDecoration: 'underline' } as const;

  return (
    <AuthCard onSubmit={handleSubmit} width={480}>
      <AuthHeading>Create an account</AuthHeading>

      {formError && <FormError message={formError} />}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
          <AuthField
            label="First name"
            autoComplete="given-name"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            error={errors.firstName}
            required
          />
          <AuthField
            label="Last name"
            autoComplete="family-name"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            error={errors.lastName}
            required
          />
        </div>

        <AuthField
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={errors.email}
          required
        />

        <PasswordField
          label="Password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={errors.password}
          required
        />

        <p style={{ fontSize: 14, lineHeight: 1.5, color: MUTED }}>
          By selecting <strong style={{ color: 'inherit' }}>Create personal account</strong>, you agree to our{' '}
          <Link to="/conditions" style={legalLink}>
            Conditions of Use
          </Link>{' '}
          and acknowledge reading our{' '}
          <Link to="/privacy" style={legalLink}>
            Privacy Notice
          </Link>
          .
        </p>

        <PrimaryPill isLoading={isSubmitting}>Create personal account</PrimaryPill>
      </div>

      <OrDivider label="or continue with" />

      <div className={styles.socialRow}>
        <SocialButton layout="inline" icon={<GoogleIcon />} label="Google" unavailable={isUnavailable('google')} onClick={() => handleSocial('google')} />
        <SocialButton layout="inline" icon={<AppleIcon />} label="Apple" unavailable={isUnavailable('apple')} onClick={() => handleSocial('apple')} />
        <SocialButton layout="inline" icon={<FacebookIcon />} label="Facebook" unavailable={isUnavailable('facebook')} onClick={() => handleSocial('facebook')} />
      </div>

      <p style={{ marginTop: 'var(--space-6)', fontSize: 15, color: MUTED }}>
        Already have an account?{' '}
        <Link to="/login" style={{ color: LINK, fontWeight: 600 }}>
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}
