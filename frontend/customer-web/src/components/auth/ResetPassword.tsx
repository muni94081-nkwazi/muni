import { useState, type FormEvent, type CSSProperties } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Input } from '@/components/common/Input/Input';
import { Button } from '@/components/common/Button/Button';
import { authApi } from '@/api/auth.api';
import { passwordStrengthMessage } from '@/utils/validators';
import { errorMessage } from '@/utils/helpers';

// Same palette as LoginForm/RegisterForm/ForgotPassword.
const WHITE = 'var(--color-white, #ffffff)';
const INK = 'var(--color-ink, #191919)';
// Not var(--color-text-secondary, ...): that global token is set to a
// near-white value used elsewhere, which would make this text unreadable.
const MUTED = '#767676';
const BORDER = 'var(--color-border, #e5e5e5)';
const PRIMARY = 'var(--color-primary-dark, #e47911)';
const PRIMARY_HOVER = 'var(--color-primary, #ff9900)';
// Ink, not white: white on the brand orange measures 2.98:1 and fails WCAG AA.
// See the palette note in AuthUI.tsx.
const ON_PRIMARY = 'var(--color-ink, #0f1111)';
const ERROR_RED = 'var(--color-error, #cc1920)';
const ERROR_TINT = 'var(--color-error-tint, #fdecea)';

const CARD_STYLE: CSSProperties = {
  maxWidth: 400,
  margin: '0 auto',
  background: WHITE,
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  padding: 'var(--space-8) var(--space-7)',
};

/**
 * MUNI's wordmark, matching the other auth screens and AuthLayout.
 *
 * This was four coloured dots in eBay's brand colours, in eBay's order — a
 * reproduction of a competitor's wordmark used as MUNI's logo. See the note in
 * ForgotPassword.tsx.
 */
function BrandMark() {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        marginBottom: 'var(--space-5)',
        fontFamily: 'var(--font-display)',
        fontWeight: 700,
        fontSize: 'var(--text-2xl)',
        color: 'var(--color-ink, #0f1111)',
      }}
    >
      Muni<span style={{ color: 'var(--color-primary-dark, #e47911)' }}>.</span>
    </div>
  );
}

export function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function validate(): boolean {
    const next: Record<string, string> = {};
    const passwordIssue = passwordStrengthMessage(newPassword);
    if (passwordIssue) next.newPassword = passwordIssue;
    if (newPassword !== confirmPassword) next.confirmPassword = 'Passwords do not match';
    if (!token) next.token = 'This reset link is invalid or has expired';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      await authApi.resetPassword({ token, newPassword });
      navigate('/login');
    } catch (error) {
      setFormError(errorMessage(error, 'This reset link may have expired. Please request a new one.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={CARD_STYLE}>
      <BrandMark />
      <h1
        style={{
          fontFamily: 'inherit',
          fontSize: 28,
          fontWeight: 400,
          color: INK,
          marginBottom: 'var(--space-2)',
        }}
      >
        Set a new password
      </h1>
      <p
        style={{
          color: MUTED,
          fontSize: 14,
          marginBottom: 'var(--space-6)',
        }}
      >
        Choose a strong password for your account.
      </p>

      {(formError || errors.token) && (
        <p
          role="alert"
          style={{
            background: ERROR_TINT,
            color: ERROR_RED,
            padding: 'var(--space-3)',
            borderRadius: 4,
            fontSize: 14,
            marginBottom: 'var(--space-4)',
          }}
        >
          {formError || errors.token}
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <Input
          label="New password"
          type="password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          error={errors.newPassword}
          required
        />
        <Input
          label="Confirm new password"
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          error={errors.confirmPassword}
          required
        />
        <Button
          type="submit"
          fullWidth
          size="lg"
          isLoading={isSubmitting}
          style={{
            background: PRIMARY,
            borderColor: PRIMARY,
            color: ON_PRIMARY,
            borderRadius: 24,
            fontWeight: 700,
          }}
          onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => {
            e.currentTarget.style.background = PRIMARY_HOVER;
          }}
          onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => {
            e.currentTarget.style.background = PRIMARY;
          }}
        >
          Reset password
        </Button>
      </div>

      <p style={{ textAlign: 'center', marginTop: 'var(--space-6)', fontSize: 14 }}>
        <Link to="/login" style={{ color: PRIMARY, textDecoration: 'none' }}>
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
