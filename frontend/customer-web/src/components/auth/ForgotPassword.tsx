import { useState, type FormEvent, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Input } from '@/components/common/Input/Input';
import { Button } from '@/components/common/Button/Button';
import { authApi } from '@/api/auth.api';
import { isValidEmail } from '@/utils/validators';
import { errorMessage } from '@/utils/helpers';

// Same palette as LoginForm/RegisterForm, kept identical
// here so all three auth screens read as one consistent flow.
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

const CARD_STYLE: CSSProperties = {
  maxWidth: 400,
  margin: '0 auto',
  background: WHITE,
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  padding: 'var(--space-8) var(--space-7)',
};

/**
 * MUNI's wordmark, matching the one AuthLayout puts at the top of every auth
 * page.
 *
 * This was four coloured dots — #e53238, #0064d2, #f5af02, #86b817 — which are
 * eBay's brand colours, in eBay's order. It was not "inspired by" a competitor's
 * wordmark; it was a reproduction of one, used as MUNI's logo on the password
 * reset screens. Nothing about it was MUNI's to use.
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

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!isValidEmail(email)) {
      setError('Enter a valid email address');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await authApi.forgotPassword({ email });
      setIsSubmitted(true);
    } catch (err) {
      // Backend intentionally never reveals whether an email exists,
      // to avoid user enumeration — so a genuine failure here is rare,
      // but we still surface unexpected errors (e.g. network issues).
      setError(errorMessage(err, 'Something went wrong. Please try again.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isSubmitted) {
    return (
      <div style={CARD_STYLE}>
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
          Check your email
        </h1>
        <p style={{ color: MUTED, fontSize: 14 }}>
          If an account exists for <strong style={{ color: INK }}>{email}</strong>, we've sent instructions to
          reset your password.
        </p>
        <Link
          to="/login"
          style={{
            display: 'inline-block',
            marginTop: 'var(--space-5)',
            color: PRIMARY,
            fontWeight: 700,
            fontSize: 14,
            textDecoration: 'none',
          }}
        >
          Back to sign in
        </Link>
      </div>
    );
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
        Reset your password
      </h1>
      <p
        style={{
          color: MUTED,
          fontSize: 14,
          marginBottom: 'var(--space-6)',
        }}
      >
        Enter your email and we'll send you a reset link.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={error ?? undefined}
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
          Send reset link
        </Button>
      </div>

      <p style={{ marginTop: 'var(--space-6)', fontSize: 14 }}>
        <Link to="/login" style={{ color: PRIMARY, textDecoration: 'none' }}>
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
