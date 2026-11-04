import { apiClient } from './axios.config';

// `getRates` used to fall back to three hardcoded rates and `trackShipment` to
// a permanent `{ status: 'in_transit', events: [] }`. Both are quietly wrong in
// a way the caller cannot detect: a seller quoting UGX 5,000 for express
// delivery because shipping-service was unreachable has quoted a price nobody
// agreed to honour, and a parcel shown as "in transit" when tracking failed is
// a support ticket waiting to happen.
//
// Errors propagate now. `createShipment` already did — the three methods just
// behaved inconsistently.

export interface ShippingRate {
  provider: string;
  price: number;
  currency: string;
  estimatedDays: number;
  type: 'express' | 'standard' | 'pickup';
}

export const shippingApi = {
  async getRates(params?: { from?: string; to?: string; weight?: number }): Promise<ShippingRate[]> {
    const { data } = await apiClient.get<{ data: ShippingRate[] }>('/shipping/rates', { params });
    return data.data ?? [];
  },

  async createShipment(
    orderId: string,
    details: { provider: string; address: string },
  ): Promise<{ trackingNumber: string }> {
    const { data } = await apiClient.post<{ data: { trackingNumber: string } }>(
      '/shipping/shipments',
      { orderId, ...details },
    );
    return data.data;
  },

  async trackShipment(trackingNumber: string) {
    const { data } = await apiClient.get(`/shipping/track/${trackingNumber}`);
    return (data as { data: unknown }).data;
  },
};
