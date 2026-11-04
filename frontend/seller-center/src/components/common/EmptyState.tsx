import React from 'react';

interface EmptyStateProps {
  icon?: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon = '📦', title, description, action }) => {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '48px 24px', textAlign: 'center', backgroundColor: '#f8f9fa', borderRadius: '8px'
    }}>
      <div style={{ fontSize: '48px', marginBottom: '16px' }}>{icon}</div>
      <h3 style={{ margin: '0 0 8px 0', color: '#202124', fontSize: '1.25rem' }}>{title}</h3>
      <p style={{ margin: '0 0 24px 0', color: '#5f6368', maxWidth: '400px' }}>{description}</p>
      {action && <div>{action}</div>}
    </div>
  );
};
