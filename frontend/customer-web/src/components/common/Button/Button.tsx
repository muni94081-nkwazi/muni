import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { classNames } from '@/utils/helpers';
import { Spinner } from '../Spinner/Spinner';
import styles from './Button.module.css';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'accent' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  isLoading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      fullWidth = false,
      isLoading = false,
      disabled,
      className,
      children,
      ...rest
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        className={classNames(styles.button, styles[variant], styles[size], fullWidth && styles.fullWidth, className)}
        disabled={disabled || isLoading}
        aria-busy={isLoading || undefined}
        {...rest}
      >
        {isLoading && <Spinner size="sm" />}
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';
