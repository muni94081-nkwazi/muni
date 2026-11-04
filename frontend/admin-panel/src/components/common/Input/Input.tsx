import React from 'react';

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix' | 'suffix'> {
  label?: string;
  error?: string;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  prefix,
  suffix,
  className,
  required,
  ...props
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: 'var(--space-3)' }}>
      {label && (
        <label style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-text-primary)' }}>
          {label} {required && <span style={{ color: 'var(--color-danger)' }}>*</span>}
        </label>
      )}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        border: `1px solid ${error ? 'var(--color-danger)' : 'var(--color-border)'}`,
        borderRadius: 'var(--radius-md)',
        backgroundColor: 'var(--color-surface)',
        overflow: 'hidden',
        padding: '0 var(--space-2)'
      }}>
        {prefix && <span style={{ marginRight: '8px', color: 'var(--color-text-secondary)' }}>{prefix}</span>}
        <input
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            padding: 'var(--space-2) 0',
            fontSize: '14px',
            backgroundColor: 'transparent',
            color: 'var(--color-text-primary)'
          }}
          {...props}
        />
        {suffix && <span style={{ marginLeft: '8px', color: 'var(--color-text-secondary)' }}>{suffix}</span>}
      </div>
      {error && <span style={{ fontSize: '12px', color: 'var(--color-danger)' }}>{error}</span>}
    </div>
  );
};
