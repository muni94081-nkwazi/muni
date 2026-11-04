import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store/hooks/useAppSelector';
import { fetchOrderById, pollOrderStatus } from '@/store/slices/orderSlice';
import { OrderConfirmation } from '@/components/checkout/OrderConfirmation';
import { LoadingState } from '@/components/common/LoadingState';

const POLLING_STATUSES = ['payment_processing'];
const POLL_INTERVAL_MS = 4000;

export function OrderConfirmationPage() {
  const { id } = useParams<{ id: string }>();
  const dispatch = useAppDispatch();
  const { currentOrder, status } = useAppSelector((state) => state.orders);

  useEffect(() => {
    if (id) {
      dispatch(fetchOrderById(id));
    }
  }, [dispatch, id]);

  useEffect(() => {
    if (!id || !currentOrder || !POLLING_STATUSES.includes(currentOrder.status)) {
      return;
    }

    const interval = setInterval(() => {
      dispatch(pollOrderStatus(id));
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [dispatch, id, currentOrder]);

  if (status === 'loading' && !currentOrder) {
    return <LoadingState />;
  }

  if (!currentOrder) {
    return <p style={{ textAlign: 'center', padding: 'var(--space-10)' }}>Order not found.</p>;
  }

  return <OrderConfirmation order={currentOrder} />;
}
