import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useOrders } from '../hooks/useOrders';
import { useToast } from '../hooks/useToast';
import { OrderDetails } from '../components/orders/OrderDetails';
import { OrderFulfillment } from '../components/orders/OrderFulfillment';
import { LoadingState } from '../components/common/LoadingState';
import type { SubOrderStatus } from '../types/order.types';
import type { FulfillmentUpdate } from '../api/orders.api';

export const OrderFulfillmentPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentOrder, fetchOrderById, updateOrderStatus, isLoading, error, clearError } = useOrders();
  const { showSuccess, showError } = useToast();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (id) fetchOrderById(id);
  }, [id, fetchOrderById]);

  const handleUpdateStatus = async (status: SubOrderStatus, fulfillment?: FulfillmentUpdate) => {
    if (!id) return;
    setBusy(true);
    const result: any = await updateOrderStatus(id, status, fulfillment);
    setBusy(false);

    // The thunk resolves either way; `error` on the result marks a rejection.
    // The old version announced success unconditionally and then re-fetched,
    // so a rejected transition looked like it had worked until the page reloaded.
    if (result?.error) {
      showError(error ?? 'Could not update the order');
      return;
    }
    showSuccess('Order status updated');
    // No re-fetch: the slice already stores the sub-order the API returned.
  };

  if (isLoading && !currentOrder) return <LoadingState />;

  if (!currentOrder) {
    return (
      <div>
        <button onClick={() => navigate('/orders')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0066cc', fontSize: 14, marginBottom: 16 }}>
          ← Back to Orders
        </button>
        <p style={{ color: '#5f6368' }}>{error ?? 'Order not found.'}</p>
      </div>
    );
  }

  return (
    <div>
      <button onClick={() => navigate('/orders')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0066cc', fontSize: 14, marginBottom: 16 }}>
        ← Back to Orders
      </button>
      <h1 style={{ margin: '0 0 24px 0', fontSize: '1.5rem' }}>Fulfill Order</h1>

      {error && (
        <div style={{ background: '#fce8e6', color: '#c5221f', padding: '12px 16px', borderRadius: 8, marginBottom: 16, fontSize: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{error}</span>
          <button onClick={clearError} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c5221f', fontSize: 18 }}>
            &times;
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
        <div style={{ flex: 2, minWidth: 320 }}>
          <OrderDetails order={currentOrder} />
        </div>
        <div style={{ flex: 1, minWidth: 260 }}>
          <OrderFulfillment order={currentOrder} busy={busy} onUpdateStatus={handleUpdateStatus} />
        </div>
      </div>
    </div>
  );
};
