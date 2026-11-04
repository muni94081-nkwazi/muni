import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/common/Button/Button';

/**
 * The building blocks shared by the sign-in and create-account screens.
 *
 * Both screens are flat pages on white — no card, no shadow — with one field
 * shape, one primary pill and one provider-button shape between them. Keeping
 * those in a single module is what stops the two pages drifting into two
 * designs the way they did when each form carried its own copy of the icons,
 * the divider and the social button.
 *
 * Nothing here touches auth state: these are presentational only, so the
 * forms keep owning validation, submission and the useAuth calls.
 */

// ─── Palette ──────────────────────────────────────────────────────────────────
//
// The primary button is dark ink on brand orange, and lightens on hover.
//
// It used to be WHITE on #e47911, which measures 2.98:1 — below the 4.5:1 WCAG
// AA needs for a 17px label. The comment here claimed that choice "roughly
// doubled the contrast" over #ff9900. It did improve it (2.14 → 2.98), but both
// numbers fail, so the button was unreadable either way for anyone with reduced
// contrast sensitivity.
//
// Flipping the label to ink rather than darkening the background keeps the
// brand orange visible — a #8a4a00 button passes too, but it is brown, and the
// orange is the brand.
//
// The hover had to move as well, and that is the part worth not undoing: ink on
// the old #c45500 hover is 4.19:1, so a button that passed at rest would have
// failed the moment a pointer touched it. Lightening on hover instead of
// darkening keeps both states legible:
//
//   rest   ink #0f1111 on #e47911 → 6.35:1  ✓
//   hover  ink #0f1111 on #ff9900 → 8.85:1  ✓
export const PRIMARY = 'var(--color-primary-dark, #e47911)';
export const PRIMARY_HOVER = 'var(--color-primary, #ff9900)';
/** Label colour for the primary pill. Ink, not white — see above. */
export const ON_PRIMARY = 'var(--color-ink, #0f1111)';
export const WHITE = 'var(--color-surface, #ffffff)';
export const INK = 'var(--color-ink, #0f1111)';
export const LINK = 'var(--color-interactive, #007185)';
/** Not var(--color-text-secondary): that token is a near-white, unreadable here. */
export const MUTED = '#767676';
/**
 * A mid-grey rather than --color-border (#ddd): at a 56px field height and a
 * 48px pill, the lighter token reads as no border at all on a white page.
 */
export const BORDER = '#c7c7c7';
export const BORDER_HOVER = '#767676';
export const ERROR_RED = 'var(--color-danger, #c7311a)';
export const ERROR_TINT = '#fdecea';

const FIELD_HEIGHT = 56;
const FIELD_RADIUS = 12;

// ─── Provider marks ───────────────────────────────────────────────────────────

export function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.98v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.66 9c0-.59.1-1.16.29-1.7V4.97H.98A9 9 0 0 0 0 9c0 1.45.35 2.83.98 4.03l2.97-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .98 4.97l2.97 2.33C4.66 5.17 6.65 3.58 9 3.58z" />
    </svg>
  );
}

export function AppleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 18 18" aria-hidden="true" fill="#000000">
      <path d="M13.53 9.45c-.02-1.87 1.53-2.77 1.6-2.82-.87-1.27-2.23-1.44-2.71-1.46-1.15-.12-2.25.68-2.83.68-.59 0-1.48-.66-2.44-.64-1.25.02-2.42.73-3.06 1.85-1.31 2.27-.33 5.63.94 7.47.62.9 1.36 1.9 2.33 1.87.94-.04 1.29-.6 2.42-.6 1.13 0 1.44.6 2.43.58 1-.02 1.64-.91 2.25-1.82.71-1.05 1-2.06 1.02-2.11-.02-.01-1.95-.75-1.95-2.99zM11.65 3.44c.51-.62.86-1.48.76-2.34-.74.03-1.63.49-2.16 1.11-.47.55-.89 1.44-.78 2.28.83.06 1.67-.42 2.18-1.05z" />
    </svg>
  );
}

export function FacebookIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#1877F2"
        d="M18 9a9 9 0 1 0-10.4 8.89v-6.29H5.31V9h2.29V7.02c0-2.26 1.35-3.51 3.41-3.51.99 0 2.02.18 2.02.18v2.22h-1.14c-1.12 0-1.47.7-1.47 1.42V9h2.5l-.4 2.6H10.4v6.29A9 9 0 0 0 18 9z"
      />
    </svg>
  );
}

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="1.6" aria-hidden="true">
      <path d="M1.8 12S5.8 5.5 12 5.5 22.2 12 22.2 12 18.2 18.5 12 18.5 1.8 12 1.8 12z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3.2" />
      {off && <path d="M4 20 20 4" strokeLinecap="round" />}
    </svg>
  );
}

// ─── Page shell ───────────────────────────────────────────────────────────────

/** The flat, left-aligned column both auth pages sit in. No card, no shadow. */
export function AuthCard({
  children,
  onSubmit,
  width = 420,
}: {
  children: ReactNode;
  onSubmit: (event: React.FormEvent) => void;
  width?: number;
}) {
  return (
    <form
      onSubmit={onSubmit}
      noValidate
      style={{
        width: '100%',
        maxWidth: width,
        margin: '0 auto',
        background: WHITE,
        textAlign: 'left',
      }}
    >
      {children}
    </form>
  );
}

export function AuthHeading({ children }: { children: ReactNode }) {
  return (
    <h1
      style={{
        fontFamily: 'inherit',
        fontSize: 'clamp(28px, 4.5vw, 36px)',
        fontWeight: 700,
        letterSpacing: '-0.02em',
        color: INK,
        margin: 0,
        marginBottom: 'var(--space-5)',
      }}
    >
      {children}
    </h1>
  );
}

export function FormError({ message }: { message: string }) {
  return (
    <p
      role="alert"
      style={{
        background: ERROR_TINT,
        color: ERROR_RED,
        padding: 'var(--space-3)',
        borderRadius: 8,
        fontSize: 14,
        marginBottom: 'var(--space-4)',
      }}
    >
      {message}
    </p>
  );
}

// ─── Fields ───────────────────────────────────────────────────────────────────

export interface AuthFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label: string;
  error?: string;
  /** Rendered inside the field, right-aligned — the password eye toggle. */
  adornment?: ReactNode;
}

/**
 * A 56px field with the label sitting inside it, floating up as soon as the
 * field is focused or filled. The reference puts the label in the box rather
 * than above it, which is also why this does not reuse the shared Input:
 * that one stacks a label above a 4px-radius box and is used app-wide, so
 * restyling it would repaint every other form in the app.
 */
export function AuthField({ label, error, adornment, id, onFocus, onBlur, ...rest }: AuthFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);

  const hasValue = String(rest.value ?? '').length > 0;
  const floated = focused || hasValue;
  const borderColor = error ? ERROR_RED : focused ? PRIMARY : hovered ? BORDER_HOVER : BORDER;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: 'relative',
          height: FIELD_HEIGHT,
          border: `1px solid ${borderColor}`,
          borderRadius: FIELD_RADIUS,
          background: rest.disabled ? '#f7f7f7' : WHITE,
          transition: 'border-color 0.15s',
        }}
      >
        <label
          htmlFor={inputId}
          style={{
            position: 'absolute',
            left: 16,
            top: floated ? 9 : '50%',
            transform: floated ? 'none' : 'translateY(-50%)',
            fontSize: floated ? 12 : 16,
            lineHeight: 1.2,
            color: MUTED,
            pointerEvents: 'none',
            transition: 'top 0.12s ease, font-size 0.12s ease, transform 0.12s ease',
          }}
        >
          {label}
        </label>
        <input
          id={inputId}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            outline: 'none',
            background: 'transparent',
            borderRadius: FIELD_RADIUS,
            color: INK,
            fontFamily: 'inherit',
            fontSize: 16,
            // Set side by side rather than as a shorthand plus an override:
            // React warns when a re-render changes `padding` and `paddingRight`
            // together, and the floating label re-renders on every keystroke.
            paddingTop: floated ? 20 : 0,
            paddingBottom: floated ? 6 : 0,
            paddingLeft: 16,
            paddingRight: adornment ? 52 : 16,
          }}
          {...rest}
        />
        {adornment && (
          <span
            style={{
              position: 'absolute',
              right: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {adornment}
          </span>
        )}
      </div>
      {error && (
        <span id={`${inputId}-error`} role="alert" style={{ fontSize: 12, color: ERROR_RED, fontWeight: 500 }}>
          {error}
        </span>
      )}
    </div>
  );
}

/** AuthField plus the show/hide eye the reference puts inside the password box. */
export function PasswordField(props: Omit<AuthFieldProps, 'type' | 'adornment'>) {
  const [visible, setVisible] = useState(false);
  return (
    <AuthField
      {...props}
      type={visible ? 'text' : 'password'}
      adornment={
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 32,
            height: 32,
            border: 'none',
            background: 'transparent',
            padding: 0,
            cursor: 'pointer',
          }}
        >
          <EyeIcon off={visible} />
        </button>
      }
    />
  );
}

// ─── Buttons ──────────────────────────────────────────────────────────────────

/** The full-width solid pill: MUNI primary, white label. */
export function PrimaryPill({
  children,
  isLoading,
  disabled,
}: {
  children: ReactNode;
  isLoading?: boolean;
  disabled?: boolean;
}) {
  return (
    <Button
      type="submit"
      fullWidth
      isLoading={isLoading}
      disabled={disabled}
      style={{
        background: PRIMARY,
        borderColor: PRIMARY,
        color: ON_PRIMARY,
        borderRadius: 28,
        height: 56,
        fontSize: 17,
        fontWeight: 700,
      }}
      onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => {
        e.currentTarget.style.background = PRIMARY_HOVER;
        e.currentTarget.style.borderColor = PRIMARY_HOVER;
      }}
      onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => {
        e.currentTarget.style.background = PRIMARY;
        e.currentTarget.style.borderColor = PRIMARY;
      }}
    >
      {children}
    </Button>
  );
}

/** The outlined pill link — "Create account" beside the "New here?" prompt. */
export function OutlinePillLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: 44,
        padding: '0 24px',
        borderRadius: 22,
        border: `1px solid ${BORDER}`,
        background: WHITE,
        color: INK,
        fontSize: 15,
        fontWeight: 600,
        textDecoration: 'none',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = BORDER_HOVER;
        e.currentTarget.style.background = '#f7f7f7';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = BORDER;
        e.currentTarget.style.background = WHITE;
      }}
    >
      {children}
    </Link>
  );
}

/**
 * Provider button. `stacked` is the sign-in shape — full width, icon pinned
 * left, label centred in the pill; `inline` is the create-account shape —
 * three equal pills in a row with the icon and label centred together.
 *
 * `unavailable` is the honest state for a provider this deployment has no
 * credentials for: muted, `aria-disabled`, and captioned, so the shopper can
 * see it will not work before spending a click on it. It is deliberately not
 * the `disabled` attribute — that would remove the button from the
 * accessibility tree and swallow the click silently, leaving a keyboard or
 * screen-reader user with no explanation at all. The click still fires and
 * the handler answers with a toast saying why.
 */
export function SocialButton({
  icon,
  label,
  onClick,
  layout = 'stacked',
  unavailable = false,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  layout?: 'stacked' | 'inline';
  unavailable?: boolean;
}) {
  const stacked = layout === 'stacked';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-disabled={unavailable || undefined}
      title={unavailable ? `${label} is not available on MUNI yet` : undefined}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: stacked ? 0 : 8,
        width: stacked ? '100%' : undefined,
        flex: stacked ? undefined : '1 1 0',
        minWidth: 0,
        height: stacked ? 52 : 48,
        background: WHITE,
        border: `1px solid ${BORDER}`,
        borderRadius: stacked ? 26 : 24,
        padding: stacked ? '0 56px' : '0 12px',
        fontFamily: 'inherit',
        fontSize: stacked ? 16 : 15,
        fontWeight: 600,
        color: unavailable ? MUTED : INK,
        opacity: unavailable ? 0.55 : 1,
        cursor: unavailable ? 'not-allowed' : 'pointer',
        transition: 'border-color 0.15s, background 0.15s',
      }}
      onMouseEnter={(e) => {
        if (unavailable) return;
        e.currentTarget.style.borderColor = BORDER_HOVER;
        e.currentTarget.style.background = '#f7f7f7';
      }}
      onMouseLeave={(e) => {
        if (unavailable) return;
        e.currentTarget.style.borderColor = BORDER;
        e.currentTarget.style.background = WHITE;
      }}
    >
      {stacked ? (
        <span style={{ position: 'absolute', left: 20, display: 'flex', alignItems: 'center' }}>{icon}</span>
      ) : (
        icon
      )}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {/* The stacked shape has room to say so without a click; the inline
          pills on the create-account row do not, so there the muted styling
          and the tooltip carry it. */}
      {unavailable && stacked && (
        <span style={{ position: 'absolute', right: 20, fontSize: 12, fontWeight: 500, color: MUTED }}>
          Unavailable
        </span>
      )}
    </button>
  );
}

// ─── Divider ──────────────────────────────────────────────────────────────────

export function OrDivider({ label = 'or' }: { label?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', margin: 'var(--space-5) 0' }}>
      <div style={{ flex: 1, height: 1, background: BORDER }} />
      <span style={{ fontSize: 14, color: MUTED }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: BORDER }} />
    </div>
  );
}

export function InfoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 10.5v6" strokeLinecap="round" />
      <circle cx="12" cy="7.4" r="1" fill={MUTED} stroke="none" />
    </svg>
  );
}
