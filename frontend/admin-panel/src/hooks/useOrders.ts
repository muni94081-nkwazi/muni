import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks/useAppSelector';
import { fetchOrdersThunk } from '@/store/slices/orderSlice';

export function useOrders() {
  const dispatch = useAppDispatch();
  const { orders, loading } = useAppSelector((s) => s.orders);

  useEffect(() => { dispatch(fetchOrdersThunk({})); }, [dispatch]);

  return { orders, isLoading: loading, error: null, refetch: () => dispatch(fetchOrdersThunk({})) };
}
