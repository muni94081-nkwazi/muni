import React from 'react';
import { Badge } from '../common/Badge/Badge';
import { Button } from '../common/Button/Button';

export const UserDetails: React.FC<{ userId?: string }> = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center', backgroundColor: 'var(--color-surface)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)' }}>
        <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: 'var(--color-info)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>S</div>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: '0 0 4px 0' }}>Sarah Namukasa</h2>
          <div style={{ color: 'var(--color-text-secondary)', marginBottom: '8px' }}>sarah@organics.ug</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Badge variant="info">SELLER</Badge>
            <Badge variant="active">Active</Badge>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button variant="danger">Suspend</Button>
          <Button variant="outline">Reset Password</Button>
        </div>
      </div>
    </div>
  );
};
