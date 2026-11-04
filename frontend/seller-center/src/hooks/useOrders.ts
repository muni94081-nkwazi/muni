import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store/rootReducer';
import {
  fetchOrders,
  fetchOrderById,
  updateOrderStatus,
  clearOrderError,
} from '../store/slices/orderSlice';
import type { SubOrderStatus } from '../types/order.types';
import type { FulfillmentUpdate } from '../api/orders.api';

export const useOrders = () => {
  const dispatch = useDispatch();
  const { orders, currentOrder, status, error, meta } = useSelector((state: RootState) => state.order);
  const isLoading = status === 'loading';

  // Memoised — OrderFulfillmentPage lists these in a useEffect dependency array,
  // so an unstable identity would re-fetch on every render.
  const fetch = useCallback(
    (args?: { page?: number; status?: SubOrderStatus }) => dispatch(fetchOrders(args) as any),
    [dispatch],
  );

  const fetchById = useCallback(
    (id: string) => dispatch(fetchOrderById(id) as any),
    [dispatch],
  );

  return {
    orders,
    currentOrder,
    isLoading,
    error,
    meta,
    fetchOrders: fetch,
    fetchOrderById: fetchById,
    updateOrderStatus: (id: string, status: SubOrderStatus, fulfillment?: FulfillmentUpdate) =>
      dispatch(updateOrderStatus({ id, status, fulfillment }) as any),
    clearError: () => dispatch(clearOrderError()),
  };
};
