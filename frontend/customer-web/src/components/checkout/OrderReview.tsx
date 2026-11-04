import type { Cart } from '@/types/cart.types';
import type { ShippingFormValues } from './ShippingForm';
import type { PaymentFormValues } from './PaymentForm';
import { formatMoney, paymentMethodLabel } from '@/utils/formatters';
import { Button } from '@/components/common/Button/Button';

export interface OrderReviewProps {
  cart: Cart;
  shipping: ShippingFormValues;
  payment: PaymentFormValues;
  onConfirm: () => void;
  onBack: () => void;
  isSubmitting?: boolean;
}

export function OrderReview({ cart, shipping, payment, onConfirm, onBack, isSubmitting }: OrderReviewProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <section>
        <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>Items</h3>
        <ul style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {cart.items.map((item) => (
            <li key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)' }}>
              <span>
                {item.productName} × {item.quantity}
              </span>
              <span className="price-tag">{formatMoney(item.lineTotal, cart.currency)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>Delivering to</h3>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
          {shipping.address}, {shipping.city}
          {shipping.district ? `, ${shipping.district}` : ''}
          <br />
          {shipping.phone}
        </p>
      </section>

      <section>
        <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>Payment method</h3>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
          {paymentMethodLabel(payment.paymentMethod)}
        </p>
      </section>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          paddingTop: 'var(--space-4)',
          borderTop: '1px solid var(--color-border)',
        }}
      >
        <span style={{ fontWeight: 700 }}>Total due</span>
        <span className="price-tag" style={{ fontSize: 'var(--text-lg)' }}>
          {formatMoney(cart.total, cart.currency)}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
        <Button variant="outline" onClick={onBack} disabled={isSubmitting}>
          Back
        </Button>
        <Button onClick={onConfirm} isLoading={isSubmitting} fullWidth size="lg">
          Place order
        </Button>
      </div>
    </div>
  );
}
