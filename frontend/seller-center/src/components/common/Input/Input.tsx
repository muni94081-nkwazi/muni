import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input: React.FC<InputProps> = ({ label, error, style, ...props }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-1)', marginBottom: 'var(--spacing-4)' }}>
      {label && <label style={{ fontSize: '0.875rem', fontWeight: 500 }}>{label} {props.required && '*'}</label>}
      <input 
        style={{
          padding: '0.5rem', borderRadius: 'var(--radius-md)', border: `1px solid ${error ? 'var(--color-danger)' : 'var(--color-border)'}`,
          outline: 'none', ...style
        }} 
        {...props} 
      />
      {error && <span style={{ fontSize: '0.75rem', color: 'var(--color-danger)' }}>{error}</span>}
    </div>
  );
};
