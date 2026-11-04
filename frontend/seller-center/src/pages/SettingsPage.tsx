import React, { useState } from 'react';
import { StoreSettings } from '../components/settings/StoreSettings';
import { ShippingSettings } from '../components/settings/ShippingSettings';
import { PaymentSettings } from '../components/settings/PaymentSettings';

export const SettingsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('store');

  const tabStyle = (isActive: boolean) => ({
    padding: '12px 24px',
    cursor: 'pointer',
    borderBottom: isActive ? '2px solid #0066cc' : '2px solid transparent',
    color: isActive ? '#0066cc' : '#5f6368',
    fontWeight: isActive ? 600 : 400,
    background: 'none',
    borderTop: 'none',
    borderLeft: 'none',
    borderRight: 'none',
    fontSize: '1rem'
  });

  return (
    <div>
      <h1 style={{ margin: '0 0 24px 0', fontSize: '1.5rem' }}>Settings</h1>
      
      <div style={{ display: 'flex', borderBottom: '1px solid #e0e0e0', marginBottom: '24px' }}>
        <button style={tabStyle(activeTab === 'store')} onClick={() => setActiveTab('store')}>Store Settings</button>
        <button style={tabStyle(activeTab === 'shipping')} onClick={() => setActiveTab('shipping')}>Shipping</button>
        <button style={tabStyle(activeTab === 'payment')} onClick={() => setActiveTab('payment')}>Payment</button>
      </div>

      <div>
        {activeTab === 'store' && <StoreSettings />}
        {activeTab === 'shipping' && <ShippingSettings />}
        {activeTab === 'payment' && <PaymentSettings />}
      </div>
    </div>
  );
};
