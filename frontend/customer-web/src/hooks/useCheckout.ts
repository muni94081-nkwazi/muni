import { useState, useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks/useAppSelector';
import { createOrder, initiateOrderPayment } from '@/store/slices/orderSlice';
import type { CreateOrderPayload, InitiatePaymentPayload } from '@/types/order.types';

export type CheckoutStep = 'shipping' | 'payment' | 'review';

export function useCheckout() {
  const dispatch = useAppDispatch();
  const { status, currentOrder, error } = useAppSelector((state) => state.orders);
  const [step, setStep] = useState<CheckoutStep>('shipping');

  const goToPayment = useCallback(() => setStep('payment'), []);
  const goToReview = useCallback(() => setStep('review'), []);
  const goBack = useCallback(() => {
    setStep((s) => (s === 'review' ? 'payment' : 'shipping'));
  }, []);

  const placeOrder = useCallback(
    async (payload: CreateOrderPayload) => {
      const result = await dispatch(createOrder(payload)).unwrap();
      return result;
    },
    [dispatch],
  );

  const initiatePayment = useCallback(
    async (orderId: string, details: InitiatePaymentPayload) => {
      const result = await dispatch(initiateOrderPayment({ orderId, details })).unwrap();
      return result;
    },
    [dispatch],
  );

  return {
    step,
    currentOrder,
    isLoading: status === 'loading',
    error,
    goToPayment,
    goToReview,
    goBack,
    placeOrder,
    initiatePayment,
  };
}
