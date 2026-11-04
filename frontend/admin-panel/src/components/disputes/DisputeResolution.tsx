import React from 'react';
import { Button } from '../common/Button/Button';

export const DisputeResolution: React.FC = () => (
  <div style={{ backgroundColor: 'var(--color-surface)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', marginTop: 'var(--space-4)' }}>
    <h3>Resolution Form</h3>
    <select style={{ width: '100%', padding: '8px', marginBottom: 'var(--space-3)' }}>
      <option>Refund buyer in full</option>
      <option>Partial refund</option>
      <option>Award seller</option>
      <option>Close no action</option>
    </select>
    <textarea placeholder="Resolution notes..." style={{ width: '100%', height: '80px', marginBottom: 'var(--space-3)', padding: '8px' }} />
    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
      <Button variant="primary">Close Dispute</Button>
      <Button variant="outline">Mark as Investigating</Button>
    </div>
  </div>
);
