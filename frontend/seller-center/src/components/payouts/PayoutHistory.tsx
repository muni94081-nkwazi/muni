import React from 'react';
import { Table } from '../common/Table/Table';
import { Badge } from '../common/Badge/Badge';

export const PayoutHistory: React.FC = () => {
  const payouts = [
    { date: '2023-10-01', amount: 'UGX 500,000', method: 'MTN MoMo', reference: 'TRX123456', status: 'completed' },
    { date: '2023-09-15', amount: 'UGX 1,200,000', method: 'Airtel Money', reference: 'TRX789012', status: 'completed' },
    { date: '2023-09-01', amount: 'UGX 850,000', method: 'Bank Transfer', reference: 'TRX345678', status: 'completed' },
    { date: '2023-10-05', amount: 'UGX 250,000', method: 'MTN MoMo', reference: 'TRX901234', status: 'pending' },
  ];

  const columns = [
    { key: 'date', label: 'Date' },
    { key: 'amount', label: 'Amount' },
    { key: 'method', label: 'Method' },
    { key: 'reference', label: 'Reference' },
    { 
      key: 'status', 
      label: 'Status',
      render: (item: any) => {
        const variants: any = { pending: 'warning', processing: 'info', completed: 'success' };
        return <Badge variant={variants[item.status]} label={item.status.toUpperCase()} />;
      }
    }
  ];

  return (
    <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '8px', border: '1px solid #e0e0e0', marginTop: '24px' }}>
      <h3 style={{ marginTop: 0 }}>Payout History</h3>
      <Table columns={columns} data={payouts} />
    </div>
  );
};
