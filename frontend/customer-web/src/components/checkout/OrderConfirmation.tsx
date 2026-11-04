import { Link } from 'react-router-dom';
import type { Order } from '@/types/order.types';
import { formatMoney, orderStatusLabel } from '@/utils/formatters';
import { Button } from '@/components/common/Button/Button';

export interface OrderConfirmationProps {
  order: Order;
}

const PROCESSING_STATUSES: Order['status'][] = ['payment_processing'];

export function OrderConfirmation({ order }: OrderConfirmationProps) {
  const isProcessing = PROCESSING_STATUSES.includes(order.status);
  const isFailed = order.status === 'payment_failed';

  return (
    <div style={{ textAlign: 'center', maxWidth: 480, margin: '0 auto', padding: 'var(--space-10) var(--space-4)' }}>
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: isFailed ? 'var(--color-terracotta)' : 'var(--color-market-green)',
          color: 'var(--color-text-on-dark)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 'var(--text-2xl)',
          margin: '0 auto var(--space-5)',
        }}
        aria-hidden="true"
      >
        {isFailed ? '!' : isProcessing ? '⏳' : '✓'}
      </div>

      <h1 style={{ fontSize: 'var(--text-2xl)', marginBottom: 'var(--space-2)' }}>
        {isFailed ? 'Payment did not go through' : isProcessing ? 'Confirming your payment...' : 'Order placed!'}
      </h1>

      <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-5)' }}>
        {isFailed
          ? 'Your order was not charged. You can try again from your orders page.'
          : isProcessing
            ? `Check your phone for a ${order.paymentMethod === 'airtel_money' ? 'Airtel Money' : 'MTN Mobile Money'} prompt to approve the payment.`
            : `Order ${order.orderNumber} is confirmed. We'll notify you as it's prepared and shipped.`}
      </p>

      <dl
        style={{
          background: 'var(--color-surface-muted)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-5)',
          textAlign: 'left',
          marginBottom: 'var(--space-6)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
        }}
      >
        <Row label="Order number" value={order.orderNumber} />
        <Row label="Status" value={orderStatusLabel(order.status)} />
        <Row label="Total" value={formatMoney(order.totalAmount, order.currency)} />
      </dl>

      <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'center' }}>
        <Link to={`/orders/${order.id}`}>
          <Button variant="outline">View order</Button>
        </Link>
        <Link to="/products">
          <Button>Continue shopping</Button>
        </Link>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)' }}>
      <dt style={{ color: 'var(--color-text-secondary)' }}>{label}</dt>
      <dd style={{ margin: 0, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{value}</dd>
    </div>
  );
}
