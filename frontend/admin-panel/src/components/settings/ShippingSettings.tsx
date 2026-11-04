import React from 'react';
import { Table } from '../common/Table/Table';

export const ShippingSettings: React.FC = () => {
  const data = [
    { district: 'Kampala', rate: 'UGX 5,000' },
    { district: 'Wakiso', rate: 'UGX 8,000' },
    { district: 'Jinja', rate: 'UGX 15,000' }
  ];
  const cols = [
    { key: 'district', label: 'District' },
    { key: 'rate', label: 'Default Rate' }
  ];
  return (
    <div style={{ maxWidth: '800px', backgroundColor: 'var(--color-surface)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)' }}>
      <h3>Shipping Defaults</h3>
      <Table columns={cols} data={data} />
    </div>
  );
};
