import React from 'react';
import { Input } from '../common/Input/Input';
import { Button } from '../common/Button/Button';

export const PlatformSettings: React.FC = () => (
  <div style={{ maxWidth: '600px', backgroundColor: 'var(--color-surface)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)' }}>
    <h3>Platform Settings</h3>
    <Input label="Platform Name" value="MUNI" />
    <Input label="Support Email" value="support@muni.ug" />
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 'var(--space-4)' }}>
      <input type="checkbox" /> <span style={{ color: 'var(--color-danger)' }}>Maintenance Mode (Dangerous)</span>
    </div>
    <Button variant="primary">Save Changes</Button>
  </div>
);
