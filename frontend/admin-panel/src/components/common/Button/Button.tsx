import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  fullWidth = false,
  className = '',
  children,
  disabled,
  ...props
}) => {
  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 'var(--radius-md)',
    fontWeight: 500,
    cursor: disabled || isLoading ? 'not-allowed' : 'pointer',
    opacity: disabled || isLoading ? 0.7 : 1,
    width: fullWidth ? '100%' : 'auto',
    border: 'none',
    transition: 'all 0.2s',
  };

  const variants: Record<string, React.CSSProperties> = {
    primary: { backgroundColor: 'var(--color-accent)', color: '#fff' },
    secondary: { backgroundColor: 'var(--color-surface)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' },
    danger: { backgroundColor: 'var(--color-danger)', color: '#fff' },
    ghost: { backgroundColor: 'transparent', color: 'var(--color-text-primary)' },
    outline: { backgroundColor: 'transparent', color: 'var(--color-accent)', border: '1px solid var(--color-accent)' },
  };

  const sizes: Record<string, React.CSSProperties> = {
    sm: { padding: 'var(--space-1) var(--space-2)', fontSize: '12px' },
    md: { padding: 'var(--space-2) var(--space-4)', fontSize: '14px' },
    lg: { padding: 'var(--space-3) var(--space-5)', fontSize: '16px' },
  };

  return (
    <button
      style={{ ...baseStyle, ...variants[variant], ...sizes[size] }}
      disabled={disabled || isLoading}
      className={className}
      {...props}
    >
      {isLoading ? <span style={{ marginRight: '8px' }}>⏳</span> : null}
      {children}
    </button>
  );
};
