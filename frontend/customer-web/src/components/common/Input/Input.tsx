import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { classNames } from '@/utils/helpers';
import styles from './Input.module.css';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label?: string;
  hint?: string;
  error?: string;
  prefix?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, error, prefix, required, className, id, ...rest }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

    return (
      <div className={classNames(styles.field, Boolean(error) && styles.hasError, className)}>
        {label && (
          <label htmlFor={inputId} className={classNames(styles.label, required && styles.required)}>
            {label}
          </label>
        )}
        <div className={classNames(styles.inputWrapper, Boolean(prefix) && styles.withPrefix)}>
          {prefix && <span className={styles.prefix}>{prefix}</span>}
          <input
            ref={ref}
            id={inputId}
            className={styles.input}
            required={required}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={describedBy}
            {...rest}
          />
        </div>
        {error && (
          <span id={`${inputId}-error`} className={styles.errorText} role="alert">
            {error}
          </span>
        )}
        {!error && hint && (
          <span id={`${inputId}-hint`} className={styles.hint}>
            {hint}
          </span>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';
