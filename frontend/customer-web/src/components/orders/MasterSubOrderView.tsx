import React, { useState } from 'react';

interface SubOrder {
  subOrderId: string;
  sellerId: string;
  sellerStoreName: string;
  status: 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
  subtotal: number;
  items: Array<{ name: string; qty: number; price: number }>;
}

interface MasterSubOrderViewProps {
  masterOrderId?: string;
  totalAmount?: number;
  subOrders?: SubOrder[];
  currency?: string;
}

export const MasterSubOrderView: React.FC<MasterSubOrderViewProps> = ({
  masterOrderId = 'MUNI-1001',
  totalAmount = 4350000,
  subOrders = [
    {
      subOrderId: 'SUB-1001-A',
      sellerId: 'seller-001',
      sellerStoreName: 'Kampala Electronics Hub',
      status: 'DELIVERED',
      subtotal: 4200000,
      items: [{ name: 'Samsung Galaxy S24 Ultra', qty: 1, price: 4200000 }],
    },
    {
      subOrderId: 'SUB-1001-B',
      sellerId: 'seller-002',
      sellerStoreName: 'Fashion Forward Uganda',
      status: 'SHIPPED',
      subtotal: 150000,
      items: [{ name: 'African Print Kitenge Dress', qty: 1, price: 150000 }],
    },
  ],
  currency = 'UGX',
}) => {
  const [activeDisputeSubOrderId, setActiveDisputeSubOrderId] = useState<string | null>(null);

  const handleOpenDispute = (subOrderId: string) => {
    setActiveDisputeSubOrderId(subOrderId);
  };

  return (
    <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 12, padding: 20, margin: '20px 0', fontFamily: 'system-ui' }}>
      {/* Master Order Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #f1f5f9', paddingBottom: 12 }}>
        <div>
          <span style={{ fontSize: 12, color: '#64748b' }}>Master Order ID:</span>
          <h3 style={{ margin: '2px 0 0 0', fontSize: 18, color: '#0f172a' }}>{masterOrderId}</h3>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: 12, color: '#64748b' }}>Master Total:</span>
          <div style={{ fontWeight: 800, fontSize: 18, color: '#0284c7' }}>{totalAmount.toLocaleString()} {currency}</div>
        </div>
      </div>

      {/* Sub-Orders per Seller */}
      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {subOrders.map((sub) => {
          const statusColors: Record<string, { bg: string; text: string }> = {
            DELIVERED: { bg: '#f0fdf4', text: '#15803d' },
            SHIPPED: { bg: '#f0f9ff', text: '#0369a1' },
            PROCESSING: { bg: '#fffbeb', text: '#b45309' },
            PENDING: { bg: '#f1f5f9', text: '#475569' },
            CANCELLED: { bg: '#fef2f2', text: '#b91c1c' },
          };
          const colors = statusColors[sub.status] || statusColors.PENDING;

          return (
            <div key={sub.subOrderId} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 14, background: '#fafafa' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: 8 }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>🏪 Sub-Order: {sub.subOrderId}</span>
                  <span style={{ fontSize: 12, color: '#64748b', marginLeft: 8 }}>({sub.sellerStoreName})</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ backgroundColor: colors.bg, color: colors.text, fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 12 }}>
                    {sub.status}
                  </span>
                  <button
                    onClick={() => handleOpenDispute(sub.subOrderId)}
                    style={{ backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                  >
                    ⚖️ Initiate Dispute
                  </button>
                </div>
              </div>

              {/* Items */}
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {sub.items.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span>{item.name} (x{item.qty})</span>
                    <span style={{ fontWeight: 600 }}>{item.price.toLocaleString()} {currency}</span>
                  </div>
                ))}
              </div>

              {activeDisputeSubOrderId === sub.subOrderId && (
                <div style={{ marginTop: 12, padding: 10, background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, fontSize: 12, color: '#991b1b' }}>
                  ✅ Dispute initiated for sub-order {sub.subOrderId}! Escrow funds frozen & assigned 48-hour seller SLA.
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
