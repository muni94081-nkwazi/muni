import { useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks/useAppSelector';
import { fetchOrders, fetchOrderById, cancelOrder } from '@/store/slices/orderSlice';

export function useOrders() {
  const dispatch = useAppDispatch();
  const { orders, currentOrder, status, meta, error } = useAppSelector((state) => state.orders);

  const loadOrders = useCallback((page = 1) => {
    dispatch(fetchOrders(page));
  }, [dispatch]);

  const loadOrderById = useCallback((id: string) => {
    dispatch(fetchOrderById(id));
  }, [dispatch]);

  const cancel = useCallback((id: string, reason: string) => {
    return dispatch(cancelOrder({ id, reason })).unwrap();
  }, [dispatch]);

  return {
    orders,
    currentOrder,
    isLoading: status === 'loading',
    error,
    meta,
    loadOrders,
    loadOrderById,
    cancel,
  };
}
