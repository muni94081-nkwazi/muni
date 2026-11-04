import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store/hooks/useAppSelector';
import { fetchOrders } from '@/store/slices/orderSlice';
import { formatMoney, formatDate, orderStatusLabel } from '@/utils/formatters';
import { LoadingState } from '@/components/common/LoadingState';

export function DashboardPage() {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const { orders, status } = useAppSelector((state) => state.orders);

  useEffect(() => {
    dispatch(fetchOrders(1));
  }, [dispatch]);

  const recentOrders = orders.slice(0, 5);

  return (
    <div>
      <h1 style={{ fontSize: 'var(--text-2xl)', marginBottom: 'var(--space-1)' }}>
        Welcome back, {user?.firstName}
      </h1>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-6)' }}>
        Here's what's happening with your account.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-8)',
        }}
      >
        <StatCard label="Total orders" value={String(orders.length)} />
        <StatCard
          label="Account status"
          value={user?.active ? 'Active' : 'Inactive'}
        />
        <StatCard label="Email" value={user?.emailVerified ? 'Verified' : 'Unverified'} />
      </div>

      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 'var(--space-3)' }}>
          <h2 style={{ fontSize: 'var(--text-lg)' }}>Recent orders</h2>
          <Link to="/orders" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-market-green)', fontWeight: 600 }}>
            View all →
          </Link>
        </div>

        {status === 'loading' ? (
          <LoadingState label="Loading recent orders" />
        ) : recentOrders.length === 0 ? (
          <p style={{ color: 'var(--color-text-secondary)' }}>No orders yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {recentOrders.map((order) => (
              <Link
                key={order.id}
                to={`/orders/${order.id}`}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: 'var(--space-3) var(--space-4)',
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-sm)',
                }}
              >
                <span>
                  <strong>{order.orderNumber}</strong>
                  <span style={{ color: 'var(--color-text-secondary)', marginLeft: 'var(--space-2)' }}>
                    {formatDate(order.placedAt)}
                  </span>
                </span>
                <span style={{ display: 'flex', gap: 'var(--space-4)' }}>
                  <span>{orderStatusLabel(order.status)}</span>
                  <span className="price-tag">{formatMoney(order.totalAmount, order.currency)}</span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-4)',
      }}
    >
      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>
        {label}
      </p>
      <p style={{ fontSize: 'var(--text-xl)', fontWeight: 700 }}>{value}</p>
    </div>
  );
}
