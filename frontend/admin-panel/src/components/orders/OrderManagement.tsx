import React, { useState } from 'react';
import { Button } from '../common/Button/Button';
import { Modal } from '../common/Modal/Modal';
import { useToast } from '@/hooks/useToast';
import { ordersApi } from '@/api/orders.api';
import type { Order } from '@/types/order.types';

interface OrderManagementProps {
  order: Order;
  /** Called with the updated order after a successful action. */
  onUpdated?: (order: Order) => void;
}

// Admin actions for a single order.
//
// Force Cancel now calls POST /api/v1/admin/orders/:id/cancel. It previously
// just raised a success toast — the order was never touched, so an admin could
// "cancel" an order and watch it keep progressing.
//
// Refund and Escalate remain unimplemented and are disabled rather than shown as
// working: a refund belongs to payment-service and an escalation to
// support-service, and neither has an endpoint here yet. A disabled control is
// honest; a toast claiming success is not.
export const OrderManagement: React.FC<OrderManagementProps> = ({ order, onUpdated }) => {
  const { show } = useToast();
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  // order-service only permits cancellation before fulfilment starts
  // (cancellableStatuses in order.service.ts); anything later needs a refund.
  const cancellable = ['pending', 'payment_processing', 'paid', 'payment_confirmed'].includes(order.status);

  const handleForceCancel = async () => {
    if (!reason.trim()) return;
    setBusy(true);
    try {
      const updated = await ordersApi.cancel(order.id, reason.trim());
      setConfirmingCancel(false);
      setReason('');
      show(`Order ${order.orderNumber} cancelled.`, 'success');
      onUpdated?.(updated);
    } catch (err: any) {
      show(err.response?.data?.message ?? 'Could not cancel this order.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ backgroundColor: 'var(--color-bg)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
      <h3 style={{ margin: '0 0 var(--space-3) 0', fontSize: '14px' }}>Admin Actions</h3>
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <Button
          variant="danger"
          size="sm"
          onClick={() => setConfirmingCancel(true)}
          disabled={!cancellable}
          title={cancellable ? undefined : `Cannot cancel an order that is ${order.statusLabel ?? order.status}`}
        >
          Force Cancel
        </Button>
        <Button variant="outline" size="sm" disabled title="Refunds are not wired to payment-service yet">
          Process Refund
        </Button>
        <Button variant="ghost" size="sm" disabled title="Escalation is not wired to support-service yet">
          Escalate to Support
        </Button>
      </div>

      <Modal isOpen={confirmingCancel} onClose={() => setConfirmingCancel(false)} title="Confirm force cancel">
        <p style={{ fontSize: '14px', marginBottom: 'var(--space-3)' }}>
          This cancels order <strong>{order.orderNumber}</strong> and every sub-order in it. This cannot be undone.
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason for cancellation (recorded on the order)"
          style={{ width: '100%', height: 80, padding: 8, borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', marginBottom: 'var(--space-4)', boxSizing: 'border-box' }}
        />
        <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={() => setConfirmingCancel(false)}>Cancel</Button>
          <Button variant="danger" onClick={handleForceCancel} disabled={busy || !reason.trim()}>
            {busy ? 'Cancelling…' : 'Force Cancel Order'}
          </Button>
        </div>
      </Modal>
    </div>
  );
};
