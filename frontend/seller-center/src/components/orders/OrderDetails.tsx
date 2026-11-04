import React from 'react';
import { Badge } from '../common/Badge/Badge';
import type { SubOrder } from '../../types/order.types';

// Every figure here now comes off the sub-order the API returned. The previous
// version derived a subtotal as `order.amount - 5000`, invented a flat 5,000
// shipping fee, and printed "Kampala, Uganda / +256 700 000000" as the shipping
// address for every order — none of which were real values.

export const OrderDetails: React.FC<{ order: SubOrder | null }> = ({ order }) => {
  if (!order) return null;

  const variants: Record<string, string> = {
    pending: 'warning',
    payment_confirmed: 'info',
    processing: 'info',
    picked_up: 'info',
    in_transit: 'info',
    out_for_delivery: 'info',
    delivered: 'success',
    cancelled: 'danger',
    refunded: 'neutral',
  };

  const money = (n: number) => `UGX ${Number(n ?? 0).toLocaleString()}`;

  return (
    <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '8px', border: '1px solid #e0e0e0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e0e0e0', paddingBottom: '16px', marginBottom: '16px' }}>
        <div>
          <h2 style={{ margin: '0 0 8px 0' }}>Order #{order.subOrderNumber}</h2>
          <span style={{ color: '#5f6368' }}>
            {order.placedAt ? new Date(order.placedAt).toLocaleString() : '—'}
          </span>
        </div>
        <Badge variant={variants[order.status] ?? 'neutral'} label={order.statusLabel ?? order.status} />
      </div>

      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '1.1rem' }}>Items</h3>
        {order.items?.map((item) => (
          <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f3f4' }}>
            <span>{item.quantity}× {item.productName} <span style={{ color: '#5f6368', fontSize: 13 }}>({item.productSku})</span></span>
            <span>{money(item.lineTotal)}</span>
          </div>
        ))}
        {!order.items?.length && <p style={{ color: '#5f6368', margin: 0 }}>No line items on this sub-order.</p>}
      </div>

      {(order.trackingNumber || order.carrier) && (
        <div style={{ backgroundColor: '#f8f9fa', padding: '16px', borderRadius: '8px', marginBottom: '24px' }}>
          <h4 style={{ margin: '0 0 8px 0' }}>Shipment</h4>
          <div style={{ color: '#3c4043', fontSize: 14 }}>
            {order.carrier && <div>Carrier: {order.carrier}</div>}
            {order.trackingNumber && <div>Tracking: {order.trackingNumber}</div>}
            {order.estimatedDeliveryDate && (
              <div>Estimated delivery: {new Date(order.estimatedDeliveryDate).toLocaleDateString()}</div>
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
        {[
          ['Subtotal', order.subtotal],
          ['Shipping', order.shippingFee],
          ...(order.taxAmount ? [['Tax', order.taxAmount] as const] : []),
          ...(order.discountAmount ? [['Discount', -order.discountAmount] as const] : []),
        ].map(([label, value]) => (
          <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', width: '260px', marginBottom: '8px' }}>
            <span style={{ color: '#5f6368' }}>{label}</span>
            <span>{money(value as number)}</span>
          </div>
        ))}

        <div style={{ display: 'flex', justifyContent: 'space-between', width: '260px', fontWeight: 'bold', fontSize: '1.2rem', marginTop: '8px', borderTop: '1px solid #e0e0e0', paddingTop: '8px' }}>
          <span>Total</span>
          <span>{money(order.totalAmount)}</span>
        </div>

        {/* The seller's actual payout, which is not the order total. */}
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '260px', marginTop: '12px', fontSize: 13, color: '#5f6368' }}>
          <span>Platform commission</span>
          <span>−{money(order.platformCommission)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '260px', fontWeight: 600, color: '#137333' }}>
          <span>Your payout</span>
          <span>{money(order.vendorShare)}</span>
        </div>
      </div>
    </div>
  );
};
