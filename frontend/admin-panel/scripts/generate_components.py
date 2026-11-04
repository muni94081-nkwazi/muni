import os

base_dir = r"c:\PROJECTS\Projects\MUNI\frontend\admin-panel\src"

def write_file(filepath, content):
    full_path = os.path.join(base_dir, filepath)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, "w", encoding="utf-8") as f:
        f.write(content.strip() + "\n")

# Common Components
write_file("components/common/Button/Button.tsx", """
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
""")

write_file("components/common/Input/Input.tsx", """
import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
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
""")

write_file("components/common/Modal/Modal.tsx", """
import React, { useEffect } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, maxWidth = '500px' }) => {
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div 
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
        padding: 'var(--space-4)'
      }}
      onClick={onClose}
    >
      <div 
        style={{
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--radius-lg)',
          width: '100%',
          maxWidth,
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh'
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ 
          padding: 'var(--space-4)', 
          borderBottom: '1px solid var(--color-border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>{title}</h2>
          <button 
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px' }}
          >
            ×
          </button>
        </div>
        <div style={{ padding: 'var(--space-4)', overflowY: 'auto' }}>
          {children}
        </div>
      </div>
    </div>
  );
};
""")

write_file("components/common/Spinner/Spinner.tsx", """
import React from 'react';

export const Spinner: React.FC<{ size?: number }> = ({ size = 24 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ animation: 'spin 1s linear infinite' }}
  >
    <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
    <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
  </svg>
);
""")

write_file("components/common/Badge/Badge.tsx", """
import React from 'react';

type BadgeVariant = 'pending' | 'approved' | 'flagged' | 'danger' | 'active' | 'suspended' | 'open' | 'resolved' | 'info';

interface BadgeProps {
  variant: BadgeVariant;
  children: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({ variant, children }) => {
  const getStyles = (): React.CSSProperties => {
    switch (variant) {
      case 'pending': return { backgroundColor: '#fff3cd', color: '#856404' }; // yellow
      case 'approved': case 'active': case 'resolved': return { backgroundColor: '#d4edda', color: '#155724' }; // green
      case 'flagged': case 'danger': return { backgroundColor: '#f8d7da', color: '#721c24' }; // red
      case 'suspended': return { backgroundColor: '#e2e3e5', color: '#383d41' }; // gray
      case 'open': case 'info': return { backgroundColor: '#cce5ff', color: '#004085' }; // blue
      default: return { backgroundColor: '#e2e3e5', color: '#383d41' };
    }
  };

  return (
    <span style={{
      ...getStyles(),
      padding: '2px 8px',
      borderRadius: 'var(--radius-full)',
      fontSize: '12px',
      fontWeight: 600,
      display: 'inline-block'
    }}>
      {children}
    </span>
  );
};
""")

write_file("components/common/Table/Table.tsx", """
import React from 'react';

interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  emptyMessage?: string;
}

export function Table<T extends Record<string, any>>({ columns, data, isLoading, emptyMessage = "No data available" }: TableProps<T>) {
  return (
    <div style={{ overflowX: 'auto', backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
            {columns.map((col) => (
              <th key={col.key} style={{ padding: 'var(--space-3) var(--space-4)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr>
              <td colSpan={columns.length} style={{ padding: 'var(--space-6)', textAlign: 'center' }}>Loading...</td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, rowIndex) => (
              <tr key={rowIndex} style={{ borderBottom: '1px solid var(--color-border)' }}>
                {columns.map((col) => (
                  <td key={col.key} style={{ padding: 'var(--space-3) var(--space-4)' }}>
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
""")

write_file("components/common/SearchBar.tsx", """
import React, { useState, useEffect } from 'react';
import { Input } from './Input/Input';

interface SearchBarProps {
  placeholder?: string;
  onSearch: (value: string) => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({ placeholder = "Search...", onSearch }) => {
  const [value, setValue] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      onSearch(value);
    }, 300);
    return () => clearTimeout(timer);
  }, [value, onSearch]);

  return (
    <Input
      placeholder={placeholder}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      prefix="🔍"
    />
  );
};
""")

write_file("components/common/Pagination.tsx", """
import React from 'react';
import { Button } from './Button/Button';

interface PaginationProps {
  currentPage: number;
  lastPage: number;
  onPageChange: (page: number) => void;
}

export const Pagination: React.FC<PaginationProps> = ({ currentPage, lastPage, onPageChange }) => {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', marginTop: 'var(--space-4)' }}>
      <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)}>
        Prev
      </Button>
      <span style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>
        Page {currentPage} of {lastPage}
      </span>
      <Button variant="outline" size="sm" disabled={currentPage >= lastPage} onClick={() => onPageChange(currentPage + 1)}>
        Next
      </Button>
    </div>
  );
};
""")

write_file("components/common/LoadingState.tsx", """
import React from 'react';
import { Spinner } from './Spinner/Spinner';

export const LoadingState: React.FC = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px', width: '100%' }}>
    <Spinner size={40} />
  </div>
);
""")

write_file("components/common/EmptyState.tsx", """
import React from 'react';
import { Button } from './Button/Button';

interface EmptyStateProps {
  icon?: string;
  title: string;
  description: string;
  actionText?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon = "📭", title, description, actionText, onAction }) => (
  <div style={{
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    padding: 'var(--space-6)', textAlign: 'center', backgroundColor: 'var(--color-surface)',
    borderRadius: 'var(--radius-md)', border: '1px dashed var(--color-border)'
  }}>
    <div style={{ fontSize: '48px', marginBottom: 'var(--space-3)' }}>{icon}</div>
    <h3 style={{ margin: '0 0 var(--space-2) 0', color: 'var(--color-text-primary)' }}>{title}</h3>
    <p style={{ margin: '0 0 var(--space-4) 0', color: 'var(--color-text-secondary)' }}>{description}</p>
    {actionText && onAction && (
      <Button onClick={onAction}>{actionText}</Button>
    )}
  </div>
);
""")

write_file("components/common/Toast/Toast.tsx", """
import React, { useEffect, useState } from 'react';
import { useAppSelector } from '../../../store/hooks/useAppSelector';
// Assuming uiSlice has a toast state or similar. We'll mock it if not present.
// Since we might not have access to exact uiSlice, we'll implement a simple self-contained toast for now that can be triggered globally.

export const Toast: React.FC = () => {
  // Replace with Redux state if uiSlice supports it
  const [toast, setToast] = useState<{ message: string, type: 'success'|'error' } | null>(null);

  useEffect(() => {
    // Listen for custom event
    const handleToast = (e: any) => setToast(e.detail);
    window.addEventListener('showToast', handleToast);
    return () => window.removeEventListener('showToast', handleToast);
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  if (!toast) return null;

  return (
    <div style={{
      position: 'fixed', bottom: '24px', right: '24px',
      backgroundColor: toast.type === 'error' ? 'var(--color-danger)' : 'var(--color-success)',
      color: '#fff', padding: '12px 24px', borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-lg)', zIndex: 9999, transition: 'all 0.3s'
    }}>
      {toast.message}
    </div>
  );
};
""")

write_file("components/common/StatCard.tsx", """
import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: string;
  trend?: string;
  colorVariant?: string;
}

export const StatCard: React.FC<StatCardProps> = ({ label, value, icon, trend, colorVariant = 'var(--color-accent)' }) => {
  return (
    <div style={{
      backgroundColor: 'var(--color-surface)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-sm)', display: 'flex', alignItems: 'center', gap: '16px'
    }}>
      <div style={{
        width: '48px', height: '48px', borderRadius: '50%', backgroundColor: `${colorVariant}20`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', color: colorVariant
      }}>
        {icon}
      </div>
      <div>
        <div style={{ color: 'var(--color-text-secondary)', fontSize: '14px', marginBottom: '4px' }}>{label}</div>
        <div style={{ color: 'var(--color-text-primary)', fontSize: '24px', fontWeight: 700 }}>
          {value}
          {trend && <span style={{ fontSize: '12px', marginLeft: '8px', color: trend.startsWith('+') ? 'var(--color-success)' : 'var(--color-danger)' }}>{trend}</span>}
        </div>
      </div>
    </div>
  );
};
""")
