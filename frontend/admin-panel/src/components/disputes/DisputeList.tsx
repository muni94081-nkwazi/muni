import React from 'react';
import { Table } from '../common/Table/Table';
import { Badge } from '../common/Badge/Badge';
import { Button } from '../common/Button/Button';

export const DisputeList: React.FC = () => {
  const data = [
    { id: 'D-0045', type: 'Item Not Received', buyer: 'John Kizza', seller: 'Kampala Organics', amount: 'UGX 30,000', status: 'open', date: '2023-12-05' }
  ];
  const cols = [
    { key: 'id', label: 'ID' },
    { key: 'type', label: 'Type' },
    { key: 'buyer', label: 'Buyer' },
    { key: 'seller', label: 'Seller' },
    { key: 'amount', label: 'Amount' },
    { key: 'status', label: 'Status', render: (d: any) => <Badge variant={d.status}>{d.status}</Badge> },
    { key: 'date', label: 'Date' },
    { key: 'actions', label: 'Actions', render: () => <Button size="sm" variant="outline">Assign / View</Button> }
  ];
  return <Table columns={cols} data={data} searchable searchPlaceholder="Search disputes…" sortable pageSize={10} />;
};
