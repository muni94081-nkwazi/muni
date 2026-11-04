import React from 'react';
import { Drawer } from '../common/Drawer/Drawer';
import { Badge } from '../common/Badge/Badge';
import type { Order } from '@/types/order.types';

interface SplitOrderVisualizationProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
}

// Shows how a single order is broken down across the sellers that fulfil parts
// of it. `subOrders` is the real split — order-service creates one per seller at
// checkout, each with its own status, payout and platform commission.
export const SplitOrderVisualization: React.FC<SplitOrderVisualizationProps> = ({ order, isOpen, onClose }) => {
  if (!order) return null;

  const money = (n: number) => `${order.currency} ${Number(n ?? 0).toLocaleString()}`;
  const sellerCount = order.subOrders?.length ?? 0;

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title={`Split Order — ${order.orderNumber}`} width="520px">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
        <div>
          <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>Buyer</div>
          <div style={{ fontWeight: 600 }}>{order.userId}</div>
        </div>
        <Badge variant={sellerCount > 1 ? 'info' : 'active'}>
          {sellerCount > 1 ? `${sellerCount} sellers` : 'Single seller'}
        </Badge>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {order.subOrders?.map((sub) => (
          <div key={sub.id} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-1)' }}>
              <span style={{ fontWeight: 700 }}>{sub.sellerName ?? sub.sellerId}</span>
              <span style={{ fontWeight: 700 }}>{money(sub.subtotal)}</span>
            </div>

            {/* Each seller's slice moves through fulfilment independently, so the
                per-sub-order status is the one that actually matters here. */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
              <Badge variant={sub.status}>{sub.statusLabel ?? sub.status.replace(/_/g, ' ')}</Badge>
              <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                {sub.subOrderNumber}
              </span>
            </div>

            {sub.items?.map((item) => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--color-text-secondary)', padding: '4px 0' }}>
                <span>{item.quantity}× {item.productName}</span>
                <span>{money(item.lineTotal)}</span>
              </div>
            ))}

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: 'var(--space-2)', paddingTop: 'var(--space-2)', borderTop: '1px dashed var(--color-border)' }}>
              <span>Seller payout {money(sub.vendorShare)}</span>
              <span>Platform fee {money(sub.platformCommission)}</span>
            </div>
          </div>
        ))}
      </div>

      <div style={{
        marginTop: 'var(--space-4)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--color-border)',
        display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '15px',
      }}>
        <span>Order Total</span>
        <span>{money(order.totalAmount)}</span>
      </div>
    </Drawer>
  );
};
