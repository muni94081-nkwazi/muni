import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ordersApi } from '@/api/orders.api';
import type { Order } from '@/types/order.types';
import { formatMoney, formatDateTime, orderStatusLabel } from '@/utils/formatters';
import { LoadingState } from '@/components/common/LoadingState';
import { logger } from '@/utils/logger';

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  icon: string;
  trend?: string;
  trendUp?: boolean;
}

function StatCard({ label, value, sub, color = '#131921', icon, trend, trendUp }: StatCardProps) {
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e0e0e0',
      borderRadius: 'var(--radius-md)',
      padding: 'var(--space-5)',
      display: 'flex',
      gap: 'var(--space-4)',
      alignItems: 'flex-start',
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 'var(--radius-md)',
        background: color, display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontSize: '1.5rem', flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 'var(--text-xs)', color: '#888', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color }}>{value}</div>
        {sub && <div style={{ fontSize: 'var(--text-xs)', color: '#999', marginTop: 2 }}>{sub}</div>}
        {trend && (
          <div style={{ fontSize: 'var(--text-xs)', color: trendUp ? '#2e7d32' : '#c7311a', marginTop: 4 }}>
            {trendUp ? '▲' : '▼'} {trend}
          </div>
        )}
      </div>
    </div>
  );
}

const STATUS_COLOR: Record<string, string> = {
  pending: '#ff9800',
  payment_processing: '#2196f3',
  paid: '#4caf50',
  confirmed: '#4caf50',
  processing: '#9c27b0',
  shipped: '#00bcd4',
  out_for_delivery: '#009688',
  delivered: '#2e7d32',
  cancelled: '#f44336',
  payment_failed: '#f44336',
};

export function AdminOverviewPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    ordersApi.list(1, 20)
      .then((res) => setOrders(res.data))
      .catch((err) => logger.error('[AdminOverviewPage] Failed to load orders:', err))
      .finally(() => setIsLoading(false));
  }, []);

  const totalRevenue = orders.filter((o) => ['paid','confirmed','processing','shipped','delivered'].includes(o.status))
    .reduce((sum, o) => sum + o.totalAmount, 0);
  const pendingCount = orders.filter((o) => o.status === 'pending').length;
  const deliveredCount = orders.filter((o) => o.status === 'delivered').length;
  const currency = orders[0]?.currency ?? 'UGX';

  const statusCounts = orders.reduce((acc, o) => {
    acc[o.status] = (acc[o.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (isLoading) return <LoadingState label="Loading admin overview..." />;

  return (
    <div>
      <div style={{ marginBottom: 'var(--space-5)' }}>
        <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: '#131921' }}>Dashboard Overview</h1>
        <p style={{ color: '#666', fontSize: 'var(--text-sm)' }}>Muni Seller Central · Uganda</p>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
        <StatCard icon="💰" label="Total Revenue" value={formatMoney(totalRevenue, currency)} sub="From paid orders" color="#131921" trend="This period" trendUp />
        <StatCard icon="📦" label="Total Orders" value={String(orders.length)} sub="Last 20 orders" color="#1565c0" trend="Active platform" trendUp />
        <StatCard icon="⏳" label="Pending Orders" value={String(pendingCount)} sub="Awaiting processing" color="#e65100" />
        <StatCard icon="✅" label="Delivered" value={String(deliveredCount)} sub="Successfully fulfilled" color="#2e7d32" trend="Great job!" trendUp />
      </div>

      {/* Order status breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-5)', marginBottom: 'var(--space-6)' }}>
        <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 'var(--radius-md)', padding: 'var(--space-5)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, marginBottom: 'var(--space-4)' }}>Order Status Breakdown</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {Object.entries(statusCounts).sort((a, b) => b[1] - a[1]).map(([status, count]) => {
              const pct = Math.round((count / orders.length) * 100);
              return (
                <div key={status}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 'var(--text-xs)', textTransform: 'capitalize' }}>{orderStatusLabel(status)}</span>
                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700 }}>{count} ({pct}%)</span>
                  </div>
                  <div style={{ height: 6, background: '#f0f0f0', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: STATUS_COLOR[status] ?? '#999', borderRadius: 3 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 'var(--radius-md)', padding: 'var(--space-5)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, marginBottom: 'var(--space-4)' }}>Quick Actions</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {[
              { label: '📦 Manage Orders', href: '/admin/orders', desc: 'View and process customer orders' },
              { label: '🛍️ Add Product', href: '/admin/products', desc: 'List a new product on Muni' },
              { label: '👥 User Management', href: '/admin/users', desc: 'View customers and vendors' },
              { label: '🏷️ Create Coupon', href: '/admin/coupons', desc: 'Launch a promotion' },
              { label: '🟢 System Health', href: '/system-status', desc: 'Monitor all backend services' },
            ].map((action) => (
              <Link
                key={action.href}
                to={action.href}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  padding: 'var(--space-3)',
                  background: '#f8f9fa',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid #e0e0e0',
                  textDecoration: 'none',
                  color: '#131921',
                  transition: 'background var(--duration-fast)',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#e8f0fe'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = '#f8f9fa'; }}
              >
                <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{action.label}</span>
                <span style={{ fontSize: 'var(--text-xs)', color: '#666' }}>{action.desc}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Orders */}
      <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 'var(--radius-md)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid #e0e0e0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 700 }}>Recent Orders</h2>
          <Link to="/admin/orders" style={{ fontSize: 'var(--text-sm)', color: '#007185' }}>View all →</Link>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
            <thead>
              <tr style={{ background: '#f8f9fa' }}>
                {['Order #', 'Date', 'Customer', 'Items', 'Total', 'Status', 'Action'].map((h) => (
                  <th key={h} style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'left', fontWeight: 700, fontSize: 'var(--text-xs)', color: '#555', borderBottom: '1px solid #e0e0e0', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.slice(0, 10).map((order, i) => (
                <tr key={order.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: 'var(--space-3) var(--space-4)', fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#007185' }}>
                    <Link to={`/orders/${order.id}`} style={{ color: '#007185', textDecoration: 'none' }}>{order.orderNumber}</Link>
                  </td>
                  <td style={{ padding: 'var(--space-3) var(--space-4)', color: '#666', whiteSpace: 'nowrap' }}>{formatDateTime(order.placedAt)}</td>
                  <td style={{ padding: 'var(--space-3) var(--space-4)', color: '#333' }}>{order.shipping?.phone ?? '—'}</td>
                  <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'center' }}>{order.itemCount}</td>
                  <td style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 700, color: '#b12704', whiteSpace: 'nowrap' }}>{formatMoney(order.totalAmount, order.currency)}</td>
                  <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                    <span style={{
                      background: STATUS_COLOR[order.status] ?? '#999',
                      color: '#fff',
                      fontSize: 'var(--text-xs)',
                      fontWeight: 700,
                      padding: '2px 10px',
                      borderRadius: 999,
                      whiteSpace: 'nowrap',
                    }}>
                      {orderStatusLabel(order.status)}
                    </span>
                  </td>
                  <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                    <Link to={`/orders/${order.id}`} style={{ color: '#007185', fontSize: 'var(--text-xs)', fontWeight: 600 }}>View →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
