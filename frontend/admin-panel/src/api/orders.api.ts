import { apiClient } from './axios.config';
import type { Order, MasterOrderStatus, PageMeta } from '@/types/order.types';

// ─── Admin Orders API ─────────────────────────────────────────────────────────
//
// Calls /api/v1/admin/orders, gated at the gateway by
// requireRole('ROLE_ADMIN', 'ROLE_SUPER_ADMIN') and proxied to order-service.
// Unlike the seller equivalent, nothing here is scoped by x-user-id — an admin
// sees every order and the full per-seller breakdown inside it.

export interface OrderPage {
  data: Order[];
  meta: PageMeta;
}

export interface OrderFilters {
  status?:   MasterOrderStatus;
  sellerId?: string;
  /** Exact match on order number or buyer id. */
  q?:        string;
}

export const ordersApi = {
  list: async (page = 1, perPage = 20, filters: OrderFilters = {}): Promise<OrderPage> => {
    const { data } = await apiClient.get('/admin/orders', {
      params: {
        page,
        per_page:  perPage,
        status:    filters.status || undefined,
        seller_id: filters.sellerId || undefined,
        q:         filters.q || undefined,
      },
    });
    return { data: data.data, meta: data.meta };
  },

  getById: async (id: string): Promise<Order> => {
    const { data } = await apiClient.get(`/admin/orders/${id}`);
    return data.data;
  },

  /**
   * Force-cancel an order and every sub-order in it.
   *
   * order-service refuses this once fulfilment has started (409) — past that
   * point the remedy is a refund, which is payment-service's job.
   */
  cancel: async (id: string, reason: string): Promise<Order> => {
    const { data } = await apiClient.post(`/admin/orders/${id}/cancel`, { reason });
    return data.data;
  },
};
