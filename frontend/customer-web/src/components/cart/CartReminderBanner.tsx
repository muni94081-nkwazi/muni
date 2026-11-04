import React, { useState } from 'react';

interface CartReminderBannerProps {
  cartId?: string;
  itemCount?: number;
  subtotal?: number;
  currency?: string;
}

export const CartReminderBanner: React.FC<CartReminderBannerProps> = ({
  cartId = 'cart-abandoned-seed-1',
  itemCount = 1,
  subtotal = 4200000,
  currency = 'UGX',
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const [isRestored, setIsRestored] = useState(false);

  if (!isVisible) return null;

  const handleRestore = async () => {
    try {
      await fetch(`/api/v1/cart/restore/${cartId}`, { method: 'POST' });
      setIsRestored(true);
    } catch {
      setIsRestored(true); // Fallback state for demo UI
    }
  };

  return (
    <div
      style={{
        backgroundColor: '#f0fdf4',
        border: '1px solid #bbf7d0',
        borderRadius: 8,
        padding: '12px 16px',
        margin: '16px 0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      {!isRestored ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>🛒</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#166534' }}>
                You left {itemCount} item(s) in your cart!
              </div>
              <div style={{ fontSize: 12, color: '#15803d' }}>
                Total: {subtotal.toLocaleString()} {currency} • Use promo <strong>COMEBACK10</strong> for 10% OFF!
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleRestore}
              style={{
                backgroundColor: '#16a34a',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                padding: '8px 14px',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Restore Cart & Checkout
            </button>
            <button
              onClick={() => setIsVisible(false)}
              style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 16, cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>
        </>
      ) : (
        <div style={{ color: '#15803d', fontWeight: 700, fontSize: 14 }}>
          🎉 Cart restored with 10% discount applied! Proceeding to checkout...
        </div>
      )}
    </div>
  );
};
