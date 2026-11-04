import React from 'react';
import { Table } from '../common/Table/Table';
import { Button } from '../common/Button/Button';

export const ProductFlagged: React.FC = () => {
  const data = [
    { id: 2, name: 'Fake Branded Shoes', reason: 'Counterfeit item reported', date: '2023-11-20' }
  ];
  const cols = [
    { key: 'name', label: 'Product Name' },
    { key: 'reason', label: 'Flag Reason' },
    { key: 'date', label: 'Date Flagged' },
    { key: 'actions', label: 'Actions', render: () => (
      <div style={{display:'flex',gap:'8px'}}>
        <Button size="sm" variant="outline">Unflag</Button>
        <Button size="sm" variant="danger">Remove</Button>
      </div>
    )}
  ];
  return <Table columns={cols} data={data} />;
};
