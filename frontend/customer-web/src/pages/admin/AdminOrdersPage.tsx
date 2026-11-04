import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ordersApi } from '@/api/orders.api';
import type { Order } from '@/types/order.types';
import { formatMoney, formatDateTime, orderStatusLabel } from '@/utils/formatters';
import { LoadingState } from '@/components/common/LoadingState';
import { logger } from '@/utils/logger';

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'payment_processing', label: 'Payment Processing' },
  { value: 'paid', label: 'Paid' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'processing', label: 'Processing' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'out_for_delivery', label: 'Out for Delivery' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
];

const STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  pending: { bg: '#fff3e0', text: '#e65100' },
  payment_processing: { bg: '#e3f2fd', text: '#1565c0' },
  paid: { bg: '#e8f5e9', text: '#2e7d32' },
  confirmed: { bg: '#e8f5e9', text: '#2e7d32' },
  processing: { bg: '#f3e5f5', text: '#6a1b9a' },
  shipped: { bg: '#e0f7fa', text: '#006064' },
  out_for_delivery: { bg: '#e0f7fa', text: '#004d40' },
  delivered: { bg: '#e8f5e9', text: '#1b5e20' },
  cancelled: { bg: '#ffebee', text: '#b71c1c' },
  payment_failed: { bg: '#ffebee', text: '#b71c1c' },
};

export function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filtered, setFiltered] = useState<Order[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    ordersApi.list(1, 50).then((res) => {
      setOrders(res.data);
      setFiltered(res.data);
    })
      .catch((err) => logger.error('[AdminOrdersPage] Failed to load orders:', err))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    let result = orders;
    if (statusFilter) result = result.filter((o) => o.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (o) => o.orderNumber.toLowerCase().includes(q) || o.shipping?.phone?.includes(q),
      );
    }
    setFiltered(result);
  }, [orders, statusFilter, search]);

  if (isLoading) return <LoadingState label="Loading orders..." />;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-5)' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700 }}>Order Management</h1>
          <p style={{ color: '#666', fontSize: 'var(--text-sm)' }}>{filtered.length} of {orders.length} orders shown</p>
        </div>
      </div>

      {/* Filters */}
      <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', marginBottom: 'var(--space-4)', display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="search"
          placeholder="Search order # or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: 'var(--space-2) var(--space-3)', border: '1px solid #ccc', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-sm)', minWidth: 220 }}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ padding: 'var(--space-2) var(--space-3)', border: '1px solid #ccc', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-sm)' }}
        >
          {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <button onClick={() => { setSearch(''); setStatusFilter(''); }} style={{ padding: 'var(--space-2) var(--space-3)', background: '#f0f0f0', border: '1px solid #ccc', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 'var(--text-sm)' }}>
          Clear filters
        </button>
      </div>

      {/* Orders table */}
      <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 'var(--radius-md)', overflowX: 'auto', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
          <thead>
            <tr style={{ background: '#f8f9fa', borderBottom: '2px solid #e0e0e0' }}>
              {['Order #', 'Placed', 'Delivery Address', 'Phone', 'Items', 'Total', 'Payment', 'Status', 'Actions'].map((h) => (
                <th key={h} style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'left', fontWeight: 700, fontSize: 'var(--text-xs)', color: '#555', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={9} style={{ padding: 'var(--space-8)', textAlign: 'center', color: '#999' }}>No orders found</td></tr>
            ) : filtered.map((order, i) => {
              const sc = STATUS_COLOR[order.status] ?? { bg: '#f0f0f0', text: '#333' };
              return (
                <tr key={order.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: 'var(--space-3) var(--space-4)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                    <Link to={`/orders/${order.id}`} style={{ color: '#007185', textDecoration: 'none' }}>{order.orderNumber}</Link>
                  </td>
                  <td style={{ padding: 'var(--space-3) var(--space-4)', color: '#666', whiteSpace: 'nowrap', fontSize: 'var(--text-xs)' }}>{formatDateTime(order.placedAt)}</td>
                  <td style={{ padding: 'var(--space-3) var(--space-4)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 'var(--text-xs)', color: '#555' }}>
                    {order.shipping?.address}, {order.shipping?.city}
                  </td>
                  <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-xs)', color: '#555' }}>{order.shipping?.phone}</td>
                  <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'center', fontWeight: 700 }}>{order.itemCount}</td>
                  <td style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 700, color: '#b12704', whiteSpace: 'nowrap' }}>{formatMoney(order.totalAmount, order.currency)}</td>
                  <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-xs)', color: '#666', textTransform: 'capitalize' }}>
                    {order.paymentMethod?.replace(/_/g, ' ') ?? '—'}
                  </td>
                  <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                    <span style={{ background: sc.bg, color: sc.text, fontSize: 'var(--text-xs)', fontWeight: 700, padding: '3px 10px', borderRadius: 999, whiteSpace: 'nowrap' }}>
                      {orderStatusLabel(order.status)}
                    </span>
                  </td>
                  <td style={{ padding: 'var(--space-3) var(--space-4)', whiteSpace: 'nowrap' }}>
                    <Link to={`/orders/${order.id}`} style={{ color: '#007185', fontSize: 'var(--text-xs)', fontWeight: 600, marginRight: 8 }}>View</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
