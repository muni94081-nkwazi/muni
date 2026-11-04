import { apiClient, type ApiEnvelope } from './client';
import type { Order, OrderStatus } from '@/types';

export const ordersApi = {
  getOrders: async (status?: OrderStatus): Promise<Order[]> => {
    const { data } = await apiClient.get<ApiEnvelope<Order[]>>('/api/v1/orders', {
      params: { status },
    });
    return data.data;
  },

  getOrderById: async (orderId: string): Promise<Order> => {
    const { data } = await apiClient.get<ApiEnvelope<Order>>(`/api/v1/orders/${orderId}`);
    return data.data;
  },

  cancelOrder: async (orderId: string, reason: string): Promise<Order> => {
    const { data } = await apiClient.post<ApiEnvelope<Order>>(
      `/api/v1/orders/${orderId}/cancel`,
      { reason }
    );
    return data.data;
  },
};
