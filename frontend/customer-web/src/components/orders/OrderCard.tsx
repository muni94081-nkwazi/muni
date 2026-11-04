import { Link } from 'react-router-dom';
import type { Order } from '@/types/order.types';
import { formatDate, formatMoney, orderStatusLabel } from '@/utils/formatters';

interface Props {
  order: Order;
}

export function OrderCard({ order }: Props) {
  const statusColors: Record<string, string> = {
    pending: '#f59e0b', payment_processing: '#f59e0b', paid: '#3b82f6',
    confirmed: '#3b82f6', processing: '#8b5cf6', shipped: '#06b6d4',
    out_for_delivery: '#06b6d4', delivered: '#10b981', cancelled: '#ef4444',
    payment_failed: '#ef4444', refunded: '#6b7280',
  };
  const color = statusColors[order.status] ?? '#6b7280';

  return (
    <Link
      to={`/orders/${order.id}`}
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: 'var(--space-4)', background: 'var(--color-surface)',
        border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
        textDecoration: 'none', color: 'inherit', transition: 'box-shadow var(--duration-base)',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.boxShadow = 'var(--shadow-card)')}
      onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'none')}
    >
      <div>
        <p style={{ fontWeight: 700, fontSize: 'var(--text-sm)', marginBottom: 'var(--space-1)' }}>
          {order.orderNumber}
        </p>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
          {formatDate(order.placedAt ?? order.createdAt)} · {order.itemCount} item{order.itemCount === 1 ? '' : 's'}
        </p>
      </div>
      <div style={{ textAlign: 'right' }}>
        <p style={{ fontSize: 'var(--text-xs)', marginBottom: 'var(--space-1)', fontWeight: 500, color }}>
          {orderStatusLabel(order.status)}
        </p>
        <span className="price-tag">{formatMoney(order.totalAmount, order.currency)}</span>
      </div>
    </Link>
  );
}
