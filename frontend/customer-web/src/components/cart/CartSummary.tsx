import { useState } from 'react';
import type { Cart } from '@/types/cart.types';
import { formatMoney } from '@/utils/formatters';
import { Button } from '@/components/common/Button/Button';
import { Input } from '@/components/common/Input/Input';
import { useCart } from '@/hooks/useCart';
import { errorMessage } from '@/utils/helpers';

export interface CartSummaryProps {
  cart: Cart;
  onCheckout?: () => void;
  showCheckoutButton?: boolean;
}

export function CartSummary({ cart, onCheckout, showCheckoutButton = true }: CartSummaryProps) {
  const { applyCoupon, removeCoupon, isLoading } = useCart();
  const [couponCode, setCouponCode] = useState('');
  const [couponError, setCouponError] = useState<string | null>(null);

  async function handleApplyCoupon() {
    if (!couponCode.trim()) return;
    setCouponError(null);
    try {
      await applyCoupon(couponCode.trim());
      setCouponCode('');
    } catch (error) {
      setCouponError(errorMessage(error, 'This coupon code could not be applied'));
    }
  }

  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-5)',
      }}
    >
      <h2 style={{ fontSize: 'var(--text-lg)', marginBottom: 'var(--space-4)' }}>Order summary</h2>

      {cart.couponCode ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 'var(--space-3)',
            fontSize: 'var(--text-sm)',
          }}
        >
          <span>
            Coupon <strong>{cart.couponCode}</strong> applied
          </span>
          <button
            onClick={() => removeCoupon()}
            style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer', textDecoration: 'underline' }}
          >
            Remove
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <Input
              placeholder="Coupon code"
              value={couponCode}
              onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
              error={couponError ?? undefined}
            />
          </div>
          <Button variant="outline" onClick={handleApplyCoupon} isLoading={isLoading}>
            Apply
          </Button>
        </div>
      )}

      <dl style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>
        <Row label="Subtotal" value={formatMoney(cart.subtotal, cart.currency)} />
        {cart.discountAmount > 0 && (
          <Row label="Discount" value={`−${formatMoney(cart.discountAmount, cart.currency)}`} accent />
        )}
        <Row label="Shipping" value="Calculated at checkout" muted />
      </dl>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginTop: 'var(--space-4)',
          paddingTop: 'var(--space-4)',
          borderTop: '1px solid var(--color-border)',
        }}
      >
        <span style={{ fontWeight: 700 }}>Total</span>
        <span className="price-tag" style={{ fontSize: 'var(--text-xl)' }}>
          {formatMoney(cart.total, cart.currency)}
        </span>
      </div>

      {showCheckoutButton && (
        <Button
          fullWidth
          size="lg"
          style={{ marginTop: 'var(--space-5)' }}
          onClick={onCheckout}
          disabled={cart.items.length === 0 || cart.hasUnavailableItems}
        >
          Proceed to checkout
        </Button>
      )}
      {cart.hasUnavailableItems && (
        <p style={{ color: 'var(--color-terracotta-dark)', fontSize: 'var(--text-xs)', marginTop: 'var(--space-2)' }}>
          Remove unavailable items before checking out.
        </p>
      )}
    </div>
  );
}

function Row({ label, value, accent, muted }: { label: string; value: string; accent?: boolean; muted?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <dt style={{ color: 'var(--color-text-secondary)' }}>{label}</dt>
      <dd
        style={{
          margin: 0,
          fontFamily: 'var(--font-mono)',
          color: accent ? 'var(--color-success)' : muted ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
          fontSize: muted ? 'var(--text-xs)' : undefined,
        }}
      >
        {value}
      </dd>
    </div>
  );
}
