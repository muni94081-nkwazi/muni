import React from 'react';
import { Drawer } from '../common/Drawer/Drawer';
import { Badge } from '../common/Badge/Badge';
import { OrderManagement } from './OrderManagement';
import type { Order } from '@/types/order.types';

interface OrderDetailsProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onViewSplit: (order: Order) => void;
  onUpdated?: (order: Order) => void;
}

export const OrderDetails: React.FC<OrderDetailsProps> = ({ order, isOpen, onClose, onViewSplit, onUpdated }) => {
  if (!order) return null;

  const money = (n: number) => `${order.currency} ${Number(n ?? 0).toLocaleString()}`;
  const sellerCount = order.subOrders?.length ?? 0;

  const rows: [string, React.ReactNode][] = [
    // No customer name: order-service does not join against auth-service, so
    // the buyer id is the only identity on this payload.
    ['Buyer', order.userId],
    ['Placed', order.placedAt ? new Date(order.placedAt).toLocaleString() : '—'],
    ['Total', money(order.totalAmount)],
    ['Payment', order.paymentMethod ?? 'Not recorded'],
    ['Sellers', order.subOrders?.map((s) => s.sellerName ?? s.sellerId).join(', ') || '—'],
    ['Ship to', `${order.shipping?.address ?? '—'}, ${order.shipping?.city ?? ''}`],
    ['Phone', order.shipping?.phone ?? '—'],
  ];

  if (order.cancellationReason) rows.push(['Cancelled', order.cancellationReason]);

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title={`Order ${order.orderNumber}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
        <Badge variant={order.status}>{order.statusLabel ?? order.status.replace(/_/g, ' ')}</Badge>
        {sellerCount > 1 && (
          <button
            onClick={() => onViewSplit(order)}
            style={{ fontSize: '12px', color: 'var(--color-accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
          >
            View seller split ({sellerCount}) →
          </button>
        )}
      </div>

      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', gap: 8, marginBottom: 8, fontSize: '13px' }}>
          <span style={{ fontWeight: 700, minWidth: 90, color: 'var(--color-text-secondary)' }}>{k}:</span>
          <span>{v}</span>
        </div>
      ))}

      <div style={{ marginTop: 'var(--space-5)' }}>
        <OrderManagement order={order} onUpdated={onUpdated} />
      </div>
    </Drawer>
  );
};
