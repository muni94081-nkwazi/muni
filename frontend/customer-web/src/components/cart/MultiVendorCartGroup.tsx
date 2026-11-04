import React from 'react';
import { handleImageError } from '@/utils/imageFallback';
import { OptimizedImage } from '@/components/common/OptimizedImage/OptimizedImage';

interface CartItem {
  id: string;
  productId: string;
  sellerId: string;
  sellerStoreName: string;
  productName: string;
  productImage: string;
  price: number;
  quantity: number;
}

interface MultiVendorCartGroupProps {
  /**
   * Required. This defaulted to two invented cart lines — named sellers
   * ("Kampala Electronics Hub"), named products, real-looking UGX prices, and
   * product photography loaded from Unsplash. Rendering it with no props
   * produced a cart that looked real and belonged to nobody. There is no
   * default that can honestly stand in for a shopper's cart, so there is none.
   */
  items: CartItem[];
  currency?: string;
}

export const MultiVendorCartGroup: React.FC<MultiVendorCartGroupProps> = ({
  items,
  currency = 'UGX',
}) => {
  // Group items by sellerId
  const grouped = items.reduce<Record<string, { storeName: string; items: CartItem[] }>>((acc, item) => {
    if (!acc[item.sellerId]) {
      acc[item.sellerId] = { storeName: item.sellerStoreName, items: [] };
    }
    acc[item.sellerId].items.push(item);
    return acc;
  }, {});

  const totalOrderAmount = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return (
    <div style={{ fontFamily: 'system-ui' }}>
      <h3 style={{ fontSize: 18, margin: '0 0 16px 0' }}>🛍️ Shopping Cart ({items.length} items from {Object.keys(grouped).length} sellers)</h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {Object.entries(grouped).map(([sellerId, group]) => {
          const sellerSubtotal = group.items.reduce((sum, i) => sum + i.price * i.quantity, 0);

          return (
            <div key={sellerId} style={{ border: '1px solid #cbd5e1', borderRadius: 8, overflow: 'hidden', background: '#ffffff' }}>
              {/* Seller Header */}
              <div style={{ backgroundColor: '#f8fafc', padding: '10px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>🏪 Seller: {group.storeName}</span>
                <span style={{ fontSize: 12, color: '#64748b' }}>Subtotal: <strong>{sellerSubtotal.toLocaleString()} {currency}</strong></span>
              </div>

              {/* Items */}
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {group.items.map((item) => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <OptimizedImage src={item.productImage} alt={item.productName} width={50} height={50} sizes="50px" onError={handleImageError} style={{ width: 50, height: 50, objectFit: 'cover', borderRadius: 6 }} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{item.productName}</div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>Qty: {item.quantity} x {item.price.toLocaleString()} {currency}</div>
                      </div>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#0284c7' }}>
                      {(item.price * item.quantity).toLocaleString()} {currency}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 20, padding: 16, background: '#f0f9ff', borderRadius: 8, border: '1px solid #bae6fd', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 800, fontSize: 16, color: '#0369a1' }}>Total Order Amount:</span>
        <span style={{ fontWeight: 800, fontSize: 20, color: '#0284c7' }}>{totalOrderAmount.toLocaleString()} {currency}</span>
      </div>
    </div>
  );
};
