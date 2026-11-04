import React from 'react';
import { Input } from '../common/Input/Input';
import { Button } from '../common/Button/Button';

export const PaymentSettings: React.FC = () => (
  <div style={{ maxWidth: '600px', backgroundColor: 'var(--color-surface)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)' }}>
    <h3>Payment Settings</h3>
    <Input label="Commission rate %" value="5" type="number" />
    <Input label="MTN MoMo merchant code" value="MUNI123" />
    <Input label="Airtel Money merchant code" value="MUNI456" />
    <Input label="Payment processing delay (hours)" value="24" type="number" />
    <Button variant="primary">Save Changes</Button>
  </div>
);
