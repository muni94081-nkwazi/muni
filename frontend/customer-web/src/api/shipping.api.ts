import { apiClient } from './axios.config';

export interface ShippingRate {
  provider: string;
  price: number;
  currency: string;
  estimatedDays: number;
  type: 'express' | 'standard' | 'pickup';
}

export const shippingApi = {
  async getRates(params?: { from?: string; to?: string; weight?: number }): Promise<ShippingRate[]> {
    try {
      const { data } = await apiClient.get<{ data: ShippingRate[] }>('/shipping/rates', { params });
      return data.data;
    } catch {
      return [
        { provider: 'MUNI Express', price: 5000, currency: 'UGX', estimatedDays: 1, type: 'express' },
        { provider: 'MUNI Standard', price: 3000, currency: 'UGX', estimatedDays: 3, type: 'standard' },
        { provider: 'Pick Up', price: 0, currency: 'UGX', estimatedDays: 0, type: 'pickup' },
      ];
    }
  },

  async trackShipment(trackingNumber: string) {
    const { data } = await apiClient.get(`/shipping/track/${trackingNumber}`);
    return (data as { data: unknown }).data;
  },
};
