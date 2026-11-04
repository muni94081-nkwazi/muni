import type { ApiEnvelope } from '@/types/api.types';

export const settingsApi = {
  getPlatformSettings: async (): Promise<ApiEnvelope<any>> => {
    return new Promise((resolve) => setTimeout(() => resolve({
      success: true,
      data: {
        platformName: 'MUNI',
        contactEmail: 'support@muni.ug',
        maintenanceMode: false,
        announcementBanner: 'Welcome to MUNI Admin Panel',
        commissionRate: 5,
        mtnMerchantCode: '123456',
        airtelMerchantCode: '654321',
        shippingRates: { Kampala: 5000, Wakiso: 8000, Mukono: 10000 }
      }
    }), 500));
  },
  
  updateSettings: async (settings: any): Promise<ApiEnvelope<any>> => {
    return new Promise((resolve) => setTimeout(() => resolve({
      success: true,
      data: settings
    }), 500));
  }
};
