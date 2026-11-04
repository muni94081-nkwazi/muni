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
