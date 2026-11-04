import React from 'react';
import { PlatformSettings } from '../components/settings/PlatformSettings';
import { PaymentSettings } from '../components/settings/PaymentSettings';
import { ShippingSettings } from '../components/settings/ShippingSettings';

export const SettingsPage: React.FC = () => (
  <div style={{ padding: 'var(--space-4)' }}>
    <h1>Settings</h1>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <PlatformSettings />
      <PaymentSettings />
      <ShippingSettings />
    </div>
  </div>
);
