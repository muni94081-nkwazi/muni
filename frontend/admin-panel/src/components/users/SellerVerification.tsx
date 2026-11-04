import React from 'react';
import { Button } from '../common/Button/Button';

export const SellerVerification: React.FC = () => {
  return (
    <div style={{ backgroundColor: 'var(--color-surface)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
      <h3 style={{ margin: '0 0 var(--space-4) 0' }}>Kampala Organics</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
        <div>
          <div style={{ color: 'var(--color-text-secondary)', fontSize: '12px' }}>Business Type</div>
          <div>Sole Proprietorship</div>
        </div>
        <div>
          <div style={{ color: 'var(--color-text-secondary)', fontSize: '12px' }}>TIN Number</div>
          <div>1002345678</div>
        </div>
      </div>
      <div style={{ padding: 'var(--space-3)', backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-4)' }}>
        📄 Business Registration Certificate submitted
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <Button variant="primary">Approve</Button>
        <Button variant="danger">Reject</Button>
      </div>
    </div>
  );
};
