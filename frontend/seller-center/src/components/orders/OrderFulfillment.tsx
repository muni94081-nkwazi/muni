import React, { useState } from 'react';
import { Modal } from '../common/Modal/Modal';
import type { SubOrder, SubOrderStatus } from '../../types/order.types';
import type { FulfillmentUpdate } from '../../api/orders.api';

interface OrderFulfillmentProps {
  order: SubOrder | null;
  busy?: boolean;
  onUpdateStatus: (status: SubOrderStatus, fulfillment?: FulfillmentUpdate) => void;
}

// order-service's real SubOrderStatus progression. The previous buttons drove
// 'shipped', which is not a member of that union — order-service would have
// stored a status no filter or label lookup recognises.
const FLOW: { status: SubOrderStatus; label: string; from: SubOrderStatus[]; needsTracking?: boolean }[] = [
  { status: 'processing',       label: 'Mark as Processing',      from: ['pending', 'payment_confirmed'] },
  { status: 'picked_up',        label: 'Mark as Picked Up',       from: ['processing'], needsTracking: true },
  { status: 'in_transit',       label: 'Mark as In Transit',      from: ['picked_up'] },
  { status: 'out_for_delivery', label: 'Mark Out for Delivery',   from: ['in_transit'] },
  { status: 'delivered',        label: 'Mark as Delivered',       from: ['out_for_delivery', 'in_transit'] },
];

export const OrderFulfillment: React.FC<OrderFulfillmentProps> = ({ order, busy, onUpdateStatus }) => {
  const [showTrackingModal, setShowTrackingModal] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [carrier, setCarrier] = useState('');

  if (!order) return null;

  const terminal = order.status === 'delivered' || order.status === 'cancelled' || order.status === 'refunded';

  return (
    <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '8px', border: '1px solid #e0e0e0' }}>
      <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem' }}>Fulfillment Action</h3>

      {terminal ? (
        <p style={{ color: '#5f6368', margin: 0 }}>
          This order is {order.statusLabel ?? order.status}. No further action is available.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {FLOW.map((step) => {
            const enabled = step.from.includes(order.status) && !busy;
            return (
              <button
                key={step.status}
                disabled={!enabled}
                onClick={() => (step.needsTracking ? setShowTrackingModal(true) : onUpdateStatus(step.status))}
                style={{
                  padding: '12px',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  cursor: enabled ? 'pointer' : 'not-allowed',
                  backgroundColor: enabled ? (step.status === 'delivered' ? '#137333' : '#0066cc') : '#fff',
                  color: enabled ? '#fff' : '#9aa0a6',
                }}
              >
                {step.label}
              </button>
            );
          })}

          <button
            disabled={busy}
            onClick={() => {
              if (window.confirm('Cancel this order? The buyer is notified and the payment is reversed.')) {
                onUpdateStatus('cancelled');
              }
            }}
            style={{ padding: '12px', border: '1px solid #c5221f', borderRadius: '4px', cursor: busy ? 'not-allowed' : 'pointer', backgroundColor: '#fff', color: '#c5221f' }}
          >
            Cancel Order
          </button>
        </div>
      )}

      <Modal isOpen={showTrackingModal} onClose={() => setShowTrackingModal(false)} title="Shipment details">
        <input
          value={carrier}
          onChange={(e) => setCarrier(e.target.value)}
          placeholder="Carrier (e.g. DHL, Posta Uganda)"
          style={{ width: '100%', padding: '10px', marginBottom: '12px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }}
        />
        <input
          value={trackingNumber}
          onChange={(e) => setTrackingNumber(e.target.value)}
          placeholder="Tracking number, e.g. TRK123456"
          style={{ width: '100%', padding: '10px', marginBottom: '16px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }}
        />
        <button
          onClick={() => {
            onUpdateStatus('picked_up', {
              trackingNumber: trackingNumber.trim() || undefined,
              carrier:        carrier.trim() || undefined,
            });
            setShowTrackingModal(false);
          }}
          style={{ width: '100%', padding: '12px', backgroundColor: '#0066cc', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
          Confirm Shipment
        </button>
      </Modal>
    </div>
  );
};
