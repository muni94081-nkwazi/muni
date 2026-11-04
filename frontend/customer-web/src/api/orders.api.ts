import { apiClient } from './axios.config';
import type { ApiEnvelope, PaginatedResponse } from '@/types/api.types';
import type { CreateOrderPayload, Order } from '@/types/order.types';

export const ordersApi = {
  async list(page = 1, perPage = 15): Promise<PaginatedResponse<Order>> {
    const { data } = await apiClient.get<PaginatedResponse<Order>>('/orders', {
      params: { page, per_page: perPage },
    });
    return data;
  },

  async getById(id: string): Promise<Order> {
    const { data } = await apiClient.get<ApiEnvelope<Order>>(`/orders/${id}`);
    return data.data;
  },

  async create(payload: CreateOrderPayload): Promise<Order> {
    const { data } = await apiClient.post<ApiEnvelope<Order>>('/orders', payload);
    return data.data;
  },

  async cancel(id: string, reason: string): Promise<Order> {
    const { data } = await apiClient.post<ApiEnvelope<Order>>(`/orders/${id}/cancel`, { reason });
    return data.data;
  },

  async getInvoice(id: string): Promise<Record<string, unknown>> {
    const { data } = await apiClient.get<ApiEnvelope<Record<string, unknown>>>(`/orders/${id}/invoice`);
    return data.data;
  },

  async requestReturn(
    orderId: string,
    payload: { order_item_id?: string; quantity: number; reason: string; description?: string },
  ): Promise<void> {
    await apiClient.post(`/orders/${orderId}/returns`, payload);
  },
};
