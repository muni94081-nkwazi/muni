import axiosInstance from './axios.config';
import type { SubOrder, SubOrderStatus, PageMeta } from '../types/order.types';

// ─── Seller Orders API ────────────────────────────────────────────────────────
//
// Calls /api/v1/seller/orders, which the gateway gates with
// requireRole('ROLE_SELLER', …) and proxies to order-service. The seller is
// identified by the gateway-stamped x-user-id, and order-service scopes the
// query to it (listSellerSubOrders) — so no vendor id is sent from here. The
// previous signature took one and ignored it.

export interface SubOrderPage {
  data: SubOrder[];
  meta: PageMeta;
}

export interface FulfillmentUpdate {
  trackingNumber?: string;
  carrier?: string;
  estimatedDeliveryDate?: string;
}

export const ordersApi = {
  /** The seller's own sub-orders, newest first. */
  list: async (page = 1, perPage = 15, status?: SubOrderStatus): Promise<SubOrderPage> => {
    const { data } = await axiosInstance.get('/seller/orders', {
      params: { page, per_page: perPage, status: status || undefined },
    });
    return { data: data.data, meta: data.meta };
  },

  getById: async (id: string): Promise<SubOrder> => {
    const { data } = await axiosInstance.get(`/seller/orders/${id}`);
    return data.data;
  },

  /**
   * Advance a sub-order through fulfillment.
   *
   * order-service validates the transition and writes shippedAt / deliveredAt
   * itself, then republishes the master order's rolled-up status.
   */
  updateStatus: async (
    id: string,
    status: SubOrderStatus,
    fulfillment: FulfillmentUpdate = {},
  ): Promise<SubOrder> => {
    const { data } = await axiosInstance.patch(`/seller/orders/${id}/status`, {
      status,
      ...fulfillment,
    });
    return data.data;
  },
};
