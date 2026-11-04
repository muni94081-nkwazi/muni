import React from 'react';
import { Table } from '../common/Table/Table';
import { Badge } from '../common/Badge/Badge';
import { Button } from '../common/Button/Button';
import type { Order } from '@/types/order.types';

interface OrderListProps {
  orders: Order[];
  isLoading?: boolean;
  onViewDetails: (order: Order) => void;
  onViewSplit: (order: Order) => void;
}

export const OrderList: React.FC<OrderListProps> = ({ orders, isLoading, onViewDetails, onViewSplit }) => {
  const columns = [
    { key: 'orderNumber', label: 'Order #' },
    {
      key: 'placedAt', label: 'Date',
      render: (o: Order) => (o.placedAt ? new Date(o.placedAt).toLocaleDateString() : '—'),
      sortAccessor: (o: Order) => o.placedAt ?? '',
    },
    // The buyer id, not a name — order-service does not resolve buyer identity.
    { key: 'userId', label: 'Buyer' },
    {
      key: 'sellers', label: 'Sellers',
      render: (o: Order) => (o.subOrders?.length ?? 0) > 1
        ? <Badge variant="info">{o.subOrders.length} sellers</Badge>
        : <span>{o.subOrders?.[0]?.sellerName ?? o.subOrders?.[0]?.sellerId ?? '—'}</span>,
      sortAccessor: (o: Order) => o.subOrders?.length ?? 0,
    },
    {
      key: 'items', label: 'Items',
      // itemCount is precomputed by order-service; falling back to a sum keeps
      // this correct for any older document written before that field existed.
      render: (o: Order) => o.itemCount ?? (o.items?.reduce((n, i) => n + i.quantity, 0) ?? 0),
      sortAccessor: (o: Order) => o.itemCount ?? 0,
    },
    {
      key: 'totalAmount', label: 'Total',
      render: (o: Order) => `${o.currency} ${Number(o.totalAmount ?? 0).toLocaleString()}`,
      sortAccessor: (o: Order) => o.totalAmount,
    },
    {
      key: 'status', label: 'Status',
      render: (o: Order) => <Badge variant={o.status}>{o.statusLabel ?? o.status.replace(/_/g, ' ')}</Badge>,
    },
    {
      key: 'actions', label: 'Actions',
      render: (o: Order) => (
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onViewDetails(o); }}>Details</Button>
          {(o.subOrders?.length ?? 0) > 1 && (
            <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); onViewSplit(o); }}>Split</Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <Table
      columns={columns}
      data={orders}
      isLoading={isLoading}
      emptyMessage="No orders match your search."
      sortable
      pageSize={10}
      getRowId={(o: Order) => o.id}
      onRowClick={onViewDetails}
    />
  );
};
