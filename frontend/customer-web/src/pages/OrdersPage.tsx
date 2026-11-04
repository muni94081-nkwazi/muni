import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store/hooks/useAppSelector';
import { fetchOrders } from '@/store/slices/orderSlice';
import { formatDate, formatMoney, orderStatusLabel } from '@/utils/formatters';
import { LoadingState } from '@/components/common/LoadingState';

export function OrdersPage() {
  const dispatch = useAppDispatch();
  const { orders, status, meta } = useAppSelector((state) => state.orders);

  useEffect(() => {
    dispatch(fetchOrders(1));
  }, [dispatch]);

  if (status === 'loading' && orders.length === 0) {
    return <LoadingState />;
  }

  return (
    <div>
      <h1 style={{ fontSize: 'var(--text-2xl)', marginBottom: 'var(--space-5)' }}>Your orders</h1>

      {orders.length === 0 ? (
        <p style={{ color: 'var(--color-text-secondary)' }}>You haven't placed any orders yet.</p>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {orders.map((order) => (
              <Link
                key={order.id}
                to={`/orders/${order.id}`}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: 'var(--space-4)',
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <div>
                  <p style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>{order.orderNumber}</p>
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                    {formatDate(order.placedAt)} · {order.itemCount} item{order.itemCount === 1 ? '' : 's'}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>
                    {orderStatusLabel(order.status)}
                  </p>
                  <span className="price-tag">{formatMoney(order.totalAmount, order.currency)}</span>
                </div>
              </Link>
            ))}
          </div>
          {meta && meta.last_page > 1 && (
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: 'var(--space-4)' }}>
              Page {meta.current_page} of {meta.last_page}
            </p>
          )}
        </>
      )}
    </div>
  );
}
