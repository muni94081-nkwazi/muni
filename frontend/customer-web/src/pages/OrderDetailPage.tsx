import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store/hooks/useAppSelector';
import { cancelOrder, fetchOrderById } from '@/store/slices/orderSlice';
import { showToast } from '@/store/slices/uiSlice';
import { formatDateTime, formatMoney, orderStatusLabel, paymentMethodLabel } from '@/utils/formatters';
import { Button } from '@/components/common/Button/Button';
import { LoadingState } from '@/components/common/LoadingState';
import { Modal } from '@/components/common/Modal/Modal';
import { Input } from '@/components/common/Input/Input';
import { errorMessage } from '@/utils/helpers';
import { OptimizedImage } from '@/components/common/OptimizedImage/OptimizedImage';

const CANCELLABLE_STATUSES = ['pending', 'payment_processing', 'paid', 'confirmed'];

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const dispatch = useAppDispatch();
  const { currentOrder, status } = useAppSelector((state) => state.orders);

  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  useEffect(() => {
    if (id) dispatch(fetchOrderById(id));
  }, [dispatch, id]);

  if (status === 'loading' && !currentOrder) {
    return <LoadingState />;
  }

  if (!currentOrder) {
    return <p style={{ color: 'var(--color-text-secondary)' }}>Order not found.</p>;
  }

  const order = currentOrder;
  const canCancel = CANCELLABLE_STATUSES.includes(order.status);

  async function handleCancel() {
    if (!cancelReason.trim()) return;
    setIsCancelling(true);
    try {
      await dispatch(cancelOrder({ id: order.id, reason: cancelReason.trim() })).unwrap();
      dispatch(showToast('Order cancelled', 'success'));
      setIsCancelModalOpen(false);
    } catch (error) {
      dispatch(showToast(errorMessage(error, 'Could not cancel this order'), 'error'));
    } finally {
      setIsCancelling(false);
    }
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 'var(--space-1)' }}>
        <h1 style={{ fontSize: 'var(--text-2xl)' }}>{order.orderNumber}</h1>
        {canCancel && (
          <Button variant="danger" size="sm" onClick={() => setIsCancelModalOpen(true)}>
            Cancel order
          </Button>
        )}
      </div>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-6)' }}>
        Placed {formatDateTime(order.placedAt)} · {orderStatusLabel(order.status)}
      </p>

      <section style={{ marginBottom: 'var(--space-6)' }}>
        <h2 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, marginBottom: 'var(--space-3)' }}>Items</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {order.items.map((item) => (
            <div key={item.id} style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
              {item.productImageUrl && (
                <OptimizedImage
                  src={item.productImageUrl}
                  alt={item.productName}
                  width={56}
                  height={56}
                  sizes="56px"
                  style={{ width: 56, height: 56, borderRadius: 'var(--radius-md)', objectFit: 'cover' }}
                />
              )}
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{item.productName}</p>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                  Qty {item.quantity} × {formatMoney(item.unitPrice, order.currency)}
                </p>
              </div>
              <span className="price-tag">{formatMoney(item.lineTotal, order.currency)}</span>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 'var(--space-6)' }}>
        <h2 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>Delivery</h2>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
          {order.shipping.address}, {order.shipping.city}
          {order.shipping.district ? `, ${order.shipping.district}` : ''}
          <br />
          {order.shipping.phone}
        </p>
      </section>

      <section style={{ marginBottom: 'var(--space-6)' }}>
        <h2 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>Payment</h2>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
          {paymentMethodLabel(order.paymentMethod)}
          {order.paymentReference && ` · Ref: ${order.paymentReference}`}
        </p>
      </section>

      <dl
        style={{
          background: 'var(--color-surface-muted)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-5)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
        }}
      >
        <Row label="Subtotal" value={formatMoney(order.subtotal, order.currency)} />
        <Row label="Shipping" value={formatMoney(order.shippingFee, order.currency)} />
        {order.discountAmount > 0 && (
          <Row label={`Discount${order.couponCode ? ` (${order.couponCode})` : ''}`} value={`−${formatMoney(order.discountAmount, order.currency)}`} />
        )}
        <Row label="Total" value={formatMoney(order.totalAmount, order.currency)} bold />
      </dl>

      <Modal isOpen={isCancelModalOpen} onClose={() => setIsCancelModalOpen(false)} title="Cancel this order?">
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)', fontSize: 'var(--text-sm)' }}>
          This can't be undone. If you've already paid, your refund will be processed within 3-5 business days.
        </p>
        <Input
          label="Reason for cancelling"
          value={cancelReason}
          onChange={(event) => setCancelReason(event.target.value)}
          required
        />
        <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
          <Button variant="outline" onClick={() => setIsCancelModalOpen(false)} fullWidth>
            Keep order
          </Button>
          <Button variant="danger" onClick={handleCancel} isLoading={isCancelling} fullWidth disabled={!cancelReason.trim()}>
            Cancel order
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)' }}>
      <dt style={{ color: 'var(--color-text-secondary)', fontWeight: bold ? 700 : 400 }}>{label}</dt>
      <dd style={{ margin: 0, fontFamily: 'var(--font-mono)', fontWeight: bold ? 700 : 500 }}>{value}</dd>
    </div>
  );
}
