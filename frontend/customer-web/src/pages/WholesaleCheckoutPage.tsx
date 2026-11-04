import React, { useState } from 'react';

export const WholesaleCheckoutPage: React.FC = () => {
  const [quantity, setQuantity] = useState(50);
  const basePrice = 4200000; // 4,200,000 UGX

  // Tier logic: 1-9 (0%), 10-49 (10%), 50-99 (18%), 100+ (25%)
  const getDiscountPercent = (qty: number) => {
    if (qty >= 100) return 25;
    if (qty >= 50) return 18;
    if (qty >= 10) return 10;
    return 0;
  };

  const discountPercent = getDiscountPercent(quantity);
  const unitPrice = Math.round(basePrice * (1 - discountPercent / 100));
  const totalPrice = unitPrice * quantity;
  const totalSavings = (basePrice - unitPrice) * quantity;

  return (
    <div style={{ maxWidth: 800, margin: '24px auto', padding: 20, fontFamily: 'system-ui', background: '#fff', border: '1px solid #cbd5e1', borderRadius: 12 }}>
      <span style={{ background: '#f0fdf4', color: '#166534', padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>
        🏢 B2B Wholesale Bulk Ordering
      </span>

      <h2 style={{ margin: '8px 0 4px 0', fontSize: 22 }}>Bulk Order Checkout — Samsung Galaxy S24 Ultra</h2>

      {/* Quantity & Discount Calculator */}
      <div style={{ margin: '20px 0', padding: 16, background: '#f8fafc', borderRadius: 8, border: '1px solid #cbd5e1' }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>SELECT BULK ORDER QUANTITY:</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
            style={{ width: 120, padding: 8, borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 16, fontWeight: 700, textAlign: 'center' }}
          />
          <span style={{ fontSize: 14, fontWeight: 600, color: '#16a34a' }}>
            🏷️ {discountPercent}% Wholesale Tier Discount Applied!
          </span>
        </div>

        {/* Pricing Summary */}
        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: '#64748b' }}>Unit Bulk Price</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#0284c7' }}>{unitPrice.toLocaleString()} UGX</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#64748b' }}>Total Savings</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#16a34a' }}>{totalSavings.toLocaleString()} UGX</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#64748b' }}>Total Wholesale Order</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{totalPrice.toLocaleString()} UGX</div>
          </div>
        </div>
      </div>

      <button style={{ width: '100%', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, padding: 14, fontSize: 16, fontWeight: 800, cursor: 'pointer' }}>
        Place Bulk Wholesale Order & Request Pro-Forma Invoice &rarr;
      </button>
    </div>
  );
};
