import React from 'react';
import { Table } from '../common/Table/Table';
import { Badge } from '../common/Badge/Badge';

interface InventoryListProps {
  inventory: any[];
  isLoading: boolean;
  onUpdateStock: (id: string, currentStock: number) => void;
}

export const InventoryList: React.FC<InventoryListProps> = ({ inventory, isLoading, onUpdateStock }) => {
  const columns = [
    { key: 'name', label: 'Product Name' },
    { key: 'sku', label: 'SKU' },
    { key: 'stock', label: 'Current Stock' },
    { key: 'threshold', label: 'Low Stock Threshold', render: () => '20' },
    { 
      key: 'status', 
      label: 'Status',
      render: (item: any) => {
        const variant = item.stock > 20 ? 'success' : item.stock > 0 ? 'warning' : 'danger';
        const label = item.stock > 20 ? 'In Stock' : item.stock > 0 ? 'Low Stock' : 'Out of Stock';
        return <Badge variant={variant} label={label} />;
      }
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (item: any) => (
        <button 
          onClick={() => onUpdateStock(item.productId, item.stock)}
          style={{ cursor: 'pointer', padding: '6px 12px', background: '#f1f3f4', border: '1px solid #dadce0', borderRadius: '4px' }}
        >
          Update
        </button>
      )
    }
  ];

  return <Table columns={columns} data={inventory} isLoading={isLoading} />;
};
