import React from 'react';

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.98v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.66 9c0-.59.1-1.16.29-1.7V4.97H.98A9 9 0 0 0 0 9c0 1.45.35 2.83.98 4.03l2.97-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .98 4.97l2.97 2.33C4.66 5.17 6.65 3.58 9 3.58z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" fill="currentColor">
      <path d="M13.53 9.45c-.02-1.87 1.53-2.77 1.6-2.82-.87-1.27-2.23-1.44-2.71-1.46-1.15-.12-2.25.68-2.83.68-.59 0-1.48-.66-2.44-.64-1.25.02-2.42.73-3.06 1.85-1.31 2.27-.33 5.63.94 7.47.62.9 1.36 1.9 2.33 1.87.94-.04 1.29-.6 2.42-.6 1.13 0 1.44.6 2.43.58 1-.02 1.64-.91 2.25-1.82.71-1.05 1-2.06 1.02-2.11-.02-.01-1.95-.75-1.95-2.99zM11.65 3.44c.51-.62.86-1.48.76-2.34-.74.03-1.63.49-2.16 1.11-.47.55-.89 1.44-.78 2.28.83.06 1.67-.42 2.18-1.05z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#1877F2" d="M18 9a9 9 0 1 0-10.4 8.89v-6.29H5.31V9h2.29V7.02c0-2.26 1.35-3.51 3.41-3.51.99 0 2.02.18 2.02.18v2.22h-1.14c-1.12 0-1.47.7-1.47 1.42V9h2.5l-.4 2.6H10.4v6.29A9 9 0 0 0 18 9z" />
    </svg>
  );
}

const ICONS = { google: <GoogleIcon />, apple: <AppleIcon />, facebook: <FacebookIcon /> };
const LABELS = { google: 'Continue with Google', apple: 'Continue with Apple', facebook: 'Continue with Facebook' };

export type SocialProvider = 'google' | 'apple' | 'facebook';

interface SocialButtonProps {
  provider: SocialProvider;
  onClick: () => void;
  disabled?: boolean;
}

export function SocialButton({ provider, onClick, disabled }: SocialButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? `${LABELS[provider]} isn't set up yet` : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--spacing-3)',
        width: '100%',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        padding: '0.65rem var(--spacing-4)',
        fontSize: '0.9rem',
        fontWeight: 600,
        color: disabled ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {ICONS[provider]}
      {LABELS[provider]}
    </button>
  );
}

export function SocialDivider() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-3)', margin: 'var(--spacing-5) 0' }}>
      <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
      <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>or</span>
      <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
    </div>
  );
}
