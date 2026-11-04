import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks/useAppSelector';
import { fetchOrdersThunk, clearOrderError } from '@/store/slices/orderSlice';
import { StatCard } from '../components/common/StatCard';
import { GlobalOrderLookup } from '../components/orders/GlobalOrderLookup';
import { OrderList } from '../components/orders/OrderList';
import { OrderDetails } from '../components/orders/OrderDetails';
import { SplitOrderVisualization } from '../components/orders/SplitOrderVisualization';
import type { Order, MasterOrderStatus } from '@/types/order.types';

// order-service's real MasterOrderStatus values. The previous list
// ('confirmed', 'shipped') matched nothing the API returns, so those filters
// were guaranteed to come back empty.
const STATUS_OPTIONS: { value: '' | MasterOrderStatus; label: string }[] = [
  { value: '',                   label: 'All' },
  { value: 'pending',            label: 'Pending' },
  { value: 'payment_processing', label: 'Payment Processing' },
  { value: 'paid',               label: 'Paid' },
  { value: 'payment_confirmed',  label: 'Payment Confirmed' },
  { value: 'processing',         label: 'Processing' },
  { value: 'completed',          label: 'Completed' },
  { value: 'cancelled',          label: 'Cancelled' },
  { value: 'payment_failed',     label: 'Payment Failed' },
  { value: 'refunded',           label: 'Refunded' },
];

export function OrdersPage() {
  const dispatch = useAppDispatch();
  const { orders, meta, total, loading, error } = useAppSelector((s) => s.orders);

  const [statusFilter, setStatusFilter] = useState<'' | MasterOrderStatus>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [detailsOrder, setDetailsOrder] = useState<Order | null>(null);
  const [splitOrder, setSplitOrder] = useState<Order | null>(null);

  useEffect(() => {
    dispatch(fetchOrdersThunk({ page, status: statusFilter || undefined, q: search || undefined }));
  }, [dispatch, page, statusFilter, search]);

  const handleSearch = useCallback((term: string) => {
    setSearch(term);
    setPage(1);
  }, []);

  // Scoped to the loaded page and labelled as such below. A platform-wide GMV
  // figure is an analytics-service question, not something to infer from
  // twenty rows — the old version summed a 24-item mock and presented the
  // result as a platform total.
  const pageTotals = useMemo(() => ({
    revenue: orders.reduce((sum, o) => sum + (o.totalAmount ?? 0), 0),
    split:   orders.filter((o) => (o.subOrders?.length ?? 0) > 1).length,
    done:    orders.filter((o) => o.status === 'completed').length,
  }), [orders]);

  /** Replace one row in place after an admin action, without a full refetch. */
  const handleUpdated = (updated: Order) => {
    setDetailsOrder(updated);
    dispatch(fetchOrdersThunk({ page, status: statusFilter || undefined, q: search || undefined }));
  };

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 20 }}>Order Management</h1>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 16px', marginBottom: 16, color: '#991b1b', fontSize: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{error}</span>
          <button onClick={() => dispatch(clearOrderError())} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b', fontSize: 18 }}>
            &times;
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <StatCard label="Orders (matching filter)" value={total} icon="🧾" colorVariant="var(--color-accent)" />
        <StatCard label="Revenue (this page)" value={`UGX ${(pageTotals.revenue / 1000).toFixed(0)}K`} icon="💰" colorVariant="var(--color-success)" />
        <StatCard label="Split Orders (this page)" value={pageTotals.split} icon="🔀" colorVariant="#8b5cf6" />
        <StatCard label="Completed (this page)" value={pageTotals.done} icon="📦" colorVariant="#06b6d4" />
      </div>

      <GlobalOrderLookup onSearch={handleSearch} resultCount={total} isLoading={loading} />

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value || 'all'}
            onClick={() => { setStatusFilter(opt.value); setPage(1); }}
            style={{
              padding: '6px 14px', borderRadius: 16, fontSize: 13, cursor: 'pointer',
              border: '1px solid ' + (statusFilter === opt.value ? '#3b82f6' : '#e2e8f0'),
              background: statusFilter === opt.value ? '#eff6ff' : '#fff',
              color: statusFilter === opt.value ? '#1d4ed8' : '#475569',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <OrderList
        orders={orders}
        isLoading={loading}
        onViewDetails={setDetailsOrder}
        onViewSplit={setSplitOrder}
      />

      {meta && meta.total > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, fontSize: 13, color: '#64748b' }}>
          <span>{meta.total} order{meta.total === 1 ? '' : 's'}</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} style={{ padding: '4px 12px', border: '1px solid #e2e8f0', borderRadius: 4, background: '#fff', cursor: page <= 1 ? 'not-allowed' : 'pointer' }}>Previous</button>
            <span>Page {meta.current_page} of {meta.last_page}</span>
            <button disabled={page >= meta.last_page} onClick={() => setPage((p) => p + 1)} style={{ padding: '4px 12px', border: '1px solid #e2e8f0', borderRadius: 4, background: '#fff', cursor: page >= meta.last_page ? 'not-allowed' : 'pointer' }}>Next</button>
          </div>
        </div>
      )}

      <OrderDetails
        order={detailsOrder}
        isOpen={detailsOrder !== null}
        onClose={() => setDetailsOrder(null)}
        onViewSplit={(o) => { setDetailsOrder(null); setSplitOrder(o); }}
        onUpdated={handleUpdated}
      />

      <SplitOrderVisualization
        order={splitOrder}
        isOpen={splitOrder !== null}
        onClose={() => setSplitOrder(null)}
      />
    </div>
  );
}
