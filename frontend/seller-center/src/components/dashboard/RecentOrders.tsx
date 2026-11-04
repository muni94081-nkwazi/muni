import React, { useEffect, useState } from 'react';
import { Table } from '../common/Table/Table';
import { Badge } from '../common/Badge/Badge';
import { ordersApi } from '../../api/orders.api';
import type { SubOrder, SubOrderStatus } from '../../types/order.types';
const STATUS_VARIANT: Record<SubOrderStatus, 'warning' | 'info' | 'success' | 'danger'> = {
  pending:           'warning',
  payment_confirmed: 'info',
  processing:        'info',
  picked_up:         'info',
  in_transit:        'info',
  out_for_delivery:  'info',
  delivered:         'success',
  cancelled:         'danger',
  refunded:          'danger',
};

const RECENT_COUNT = 5;

const money = (amount: number) =>
  `UGX ${Number(amount ?? 0).toLocaleString('en-UG')}`;

const shortDate = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString('en-UG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export const RecentOrders: React.FC = () => {
  const [orders, setOrders] = useState<SubOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    ordersApi
      .list(1, RECENT_COUNT)
      .then((page) => { if (!cancelled) setOrders(page.data ?? []); })
      .catch(() => {
        // Says so, rather than falling back to invented rows — which is what
        // this component did unconditionally.
        if (!cancelled) setError('Could not load your recent orders.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, []);

  const columns = [
    { key: 'subOrderNumber', label: 'Order #' },
    {
      key: 'items',
      label: 'Items',
      render: (item: SubOrder) => {
        const count = (item.items ?? []).reduce((n, line) => n + (line.quantity ?? 0), 0);
        return `${count} item${count === 1 ? '' : 's'}`;
      },
    },
    {
      key: 'totalAmount',
      label: 'Amount',
      render: (item: SubOrder) => money(item.totalAmount),
    },
    {
      key: 'placedAt',
      label: 'Date',
      render: (item: SubOrder) => shortDate(item.placedAt),
    },
    {
      key: 'status',
      label: 'Status',
      render: (item: SubOrder) => (
        <Badge
          variant={STATUS_VARIANT[item.status] ?? 'info'}
          label={item.statusLabel ?? item.status}
        />
      ),
    },
  ];

  return (
    <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
      <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem' }}>Recent Orders</h3>

      {loading && <p style={{ margin: 0, color: '#666' }}>Loading…</p>}

      {!loading && error && <p style={{ margin: 0, color: '#b3261e' }}>{error}</p>}

      {!loading && !error && orders.length === 0 && (
        <p style={{ margin: 0, color: '#666' }}>No orders yet. They will appear here as they come in.</p>
      )}

      {!loading && !error && orders.length > 0 && <Table columns={columns} data={orders} />}
    </div>
  );
};
