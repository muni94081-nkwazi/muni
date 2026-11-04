import type { PlatformMetrics, GMVData, SellerPerformance } from '@/types/analytics.types';
import type { ApiEnvelope, PaginatedResponse } from '@/types/api.types';

export const analyticsApi = {
  getPlatformOverview: async (): Promise<ApiEnvelope<PlatformMetrics>> => {
    return new Promise((resolve) => setTimeout(() => resolve({
      success: true,
      data: {
        totalUsers: 15420,
        activeSellers: 342,
        totalOrders: 42100,
        pendingDisputes: 12,
        platformRevenue: 15000000,
        totalGmv: 450000000
      }
    }), 500));
  },
  
  getGMV: async (_period: 'daily' | 'weekly' | 'monthly'): Promise<ApiEnvelope<GMVData[]>> => {
    return new Promise((resolve) => setTimeout(() => resolve({
      success: true,
      data: Array.from({ length: 12 }).map((_, i) => ({
        date: new Date(2025, i, 1).toISOString(),
        amount: Math.random() * 50000000 + 10000000
      }))
    }), 500));
  },
  
  getSellerPerformance: async (page = 1, pageSize = 20): Promise<ApiEnvelope<PaginatedResponse<SellerPerformance>>> => {
    return new Promise((resolve) => setTimeout(() => resolve({
      success: true,
      data: {
        items: [
          { sellerId: 's1', sellerName: 'Kampala Electronics', gmv: 45000000, ordersCount: 120, fulfillmentRate: 98.5, rating: 4.8 }
        ],
        total: 1, page, pageSize, totalPages: 1
      }
    }), 500));
  },
  
  exportReport: async (_type: 'orders' | 'revenue' | 'users', _dateRange: { start: string; end: string }): Promise<ApiEnvelope<{ url: string }>> => {
    return new Promise((resolve) => setTimeout(() => resolve({
      success: true,
      data: { url: 'https://example.com/report.csv' }
    }), 800));
  }
};
