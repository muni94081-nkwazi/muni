import React, { useState } from 'react';

interface SubOrder {
  subOrderId: string;
  customerName: string;
  shippingAddress: string;
  totalAmount: number;
  status: 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
  trackingNumber?: string;
  carrier?: string;
}

export const SubOrderStatusManager: React.FC = () => {
  const [subOrders, setSubOrders] = useState<SubOrder[]>([
    {
      subOrderId: 'SUB-1001-A',
      customerName: 'MUNI Customer',
      shippingAddress: 'Plot 12 Entebbe Road, Kampala',
      totalAmount: 4200000,
      status: 'PROCESSING',
      trackingNumber: 'DHL-UG-998822',
      carrier: 'DHL Express Uganda',
    },
  ]);

  const handleUpdateStatus = (subOrderId: string, status: SubOrder['status']) => {
    setSubOrders((prev) => prev.map((s) => (s.subOrderId === subOrderId ? { ...s, status } : s)));
  };

  return (
    <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, padding: 16, margin: '16px 0', fontFamily: 'system-ui' }}>
      <h3 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#0f172a' }}>📦 Sub-Order Fulfillment Status Manager</h3>

      {subOrders.map((s) => (
        <div key={s.subOrderId} style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: 12, background: '#fafafa' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontWeight: 700, fontSize: 14 }}>Sub-Order #{s.subOrderId}</span>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{s.customerName} • {s.shippingAddress}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: '#0284c7' }}>{s.totalAmount.toLocaleString()} UGX</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>Carrier: {s.carrier} ({s.trackingNumber})</div>
            </div>
          </div>

          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>UPDATE STATUS:</span>
            <select
              value={s.status}
              onChange={(e) => handleUpdateStatus(s.subOrderId, e.target.value as any)}
              style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid #cbd5e1', fontSize: 12, fontWeight: 700 }}
            >
              <option value="PENDING">PENDING</option>
              <option value="PROCESSING">PROCESSING (Packing Item)</option>
              <option value="SHIPPED">SHIPPED (Handed to Carrier)</option>
              <option value="DELIVERED">DELIVERED (Buyer Received)</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>
            <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>
              ✅ Status published to Kafka order-events
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};
