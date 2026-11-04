import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrders } from '../hooks/useOrders';
import type { SubOrderStatus } from '../types/order.types';

// These are order-service's actual SubOrderStatus values. The previous list
// ('confirmed', 'shipped') matched nothing the API can return.
const STATUSES: { value: '' | SubOrderStatus; label: string }[] = [
  { value: '',                  label: 'All Orders' },
  { value: 'pending',           label: 'Pending' },
  { value: 'payment_confirmed', label: 'Payment Confirmed' },
  { value: 'processing',        label: 'Processing' },
  { value: 'picked_up',         label: 'Picked Up' },
  { value: 'in_transit',        label: 'In Transit' },
  { value: 'out_for_delivery',  label: 'Out for Delivery' },
  { value: 'delivered',         label: 'Delivered' },
  { value: 'cancelled',         label: 'Cancelled' },
];

const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  payment_confirmed: '#3b82f6',
  processing: '#8b5cf6',
  picked_up: '#0ea5e9',
  in_transit: '#06b6d4',
  out_for_delivery: '#14b8a6',
  delivered: '#10b981',
  cancelled: '#ef4444',
  refunded: '#94a3b8',
};

export function OrdersPage() {
  const navigate = useNavigate();
  const { orders, isLoading, error, meta, fetchOrders, clearError } = useOrders();
  const [activeStatus, setActiveStatus] = useState<'' | SubOrderStatus>('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetchOrders({ page, status: activeStatus || undefined });
  }, [fetchOrders, page, activeStatus]);

  const th = { padding: '12px 16px', textAlign: 'left' as const, fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' as const };
  const td = { padding: '12px 16px', fontSize: 13 };

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>Orders</h1>

      {error && (
        <div style={{ background: '#fce8e6', color: '#c5221f', padding: '12px 16px', borderRadius: 8, marginBottom: 16, fontSize: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{error}</span>
          <button onClick={clearError} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c5221f', fontSize: 18 }}>
            &times;
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {STATUSES.map((s) => (
          <button
            key={s.value || 'all'}
            onClick={() => { setActiveStatus(s.value); setPage(1); }}
            style={{
              padding: '6px 14px', borderRadius: 20, border: '1px solid', fontSize: 13, cursor: 'pointer', fontWeight: 500,
              borderColor: activeStatus === s.value ? '#3b82f6' : '#e2e8f0',
              background: activeStatus === s.value ? '#3b82f6' : '#fff',
              color: activeStatus === s.value ? '#fff' : '#0f172a',
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0', overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#f8fafc' }}>
            <tr>
              {['Order #', 'Placed', 'Items', 'Total (UGX)', 'Your Share', 'Status', 'Action'].map((h) => (
                <th key={h} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>Loading…</td></tr>
            )}

            {!isLoading && orders.map((o, i) => (
              <tr key={o.id} style={{ borderTop: i > 0 ? '1px solid #e2e8f0' : 'none' }}>
                <td style={{ ...td, fontWeight: 700 }}>{o.subOrderNumber}</td>
                <td style={td}>{o.placedAt ? new Date(o.placedAt).toLocaleDateString() : '—'}</td>
                <td style={td}>{o.items?.length ?? 0}</td>
                <td style={{ ...td, fontWeight: 600 }}>{Number(o.totalAmount ?? 0).toLocaleString()}</td>
                {/* What the seller is actually paid, after platformCommission. */}
                <td style={td}>{Number(o.vendorShare ?? 0).toLocaleString()}</td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ background: (STATUS_COLORS[o.status] ?? '#94a3b8') + '20', color: STATUS_COLORS[o.status] ?? '#94a3b8', padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>
                    {o.statusLabel ?? o.status}
                  </span>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <button
                    onClick={() => navigate(`/orders/${o.id}`)}
                    style={{ fontSize: 13, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    Fulfill →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!isLoading && orders.length === 0 && (
          <p style={{ textAlign: 'center', padding: 32, color: '#64748b' }}>No orders found.</p>
        )}
      </div>

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
    </div>
  );
}
