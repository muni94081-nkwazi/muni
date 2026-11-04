import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Table } from '../common/Table/Table';
import { Badge } from '../common/Badge/Badge';

interface OrderListProps {
  orders: any[];
  isLoading: boolean;
}

export const OrderList: React.FC<OrderListProps> = ({ orders, isLoading }) => {
  const navigate = useNavigate();

  const columns = [
    { key: 'id', label: 'Order #' },
    { key: 'date', label: 'Date' },
    { key: 'customerName', label: 'Customer' },
    { key: 'itemsCount', label: 'Items', render: (item: any) => item.items?.length || 1 },
    { key: 'amount', label: 'Total (UGX)', render: (item: any) => `UGX ${item.amount.toLocaleString()}` },
    { 
      key: 'status', 
      label: 'Status',
      render: (item: any) => {
        const variants: any = { pending: 'warning', processing: 'info', shipped: 'info', delivered: 'success' };
        return <Badge variant={variants[item.status]} label={item.status.toUpperCase()} />;
      }
    },
    {
      key: 'actions',
      label: 'Action',
      render: (item: any) => (
        <button 
          onClick={() => navigate(`/orders/${item.id}`)}
          style={{ cursor: 'pointer', background: 'none', border: 'none', color: '#0066cc', textDecoration: 'underline' }}
        >
          View / Fulfill
        </button>
      )
    }
  ];

  return <Table columns={columns} data={orders} isLoading={isLoading} />;
};
