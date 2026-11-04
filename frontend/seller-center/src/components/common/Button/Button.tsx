import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children, variant = 'primary', size = 'md', isLoading, fullWidth, style, ...props
}) => {
  const baseStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    border: 'none', borderRadius: 'var(--radius-md)', cursor: isLoading ? 'not-allowed' : 'pointer',
    width: fullWidth ? '100%' : 'auto', fontWeight: 500,
    padding: size === 'sm' ? '0.25rem 0.5rem' : size === 'lg' ? '0.75rem 1.5rem' : '0.5rem 1rem',
    backgroundColor: variant === 'primary' ? 'var(--color-accent)' : variant === 'danger' ? 'var(--color-danger)' : variant === 'secondary' ? 'var(--color-surface)' : 'transparent',
    color: variant === 'primary' || variant === 'danger' ? '#fff' : 'var(--color-text-primary)',
    borderStyle: 'solid', borderWidth: variant === 'secondary' ? '1px' : '0', borderColor: 'var(--color-border)',
    opacity: isLoading || props.disabled ? 0.7 : 1, ...style
  };

  return (
    <button style={baseStyle} disabled={isLoading || props.disabled} {...props}>
      {isLoading ? 'Loading...' : children}
    </button>
  );
};
