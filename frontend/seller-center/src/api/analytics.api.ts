import { apiClient } from './axios.config';

// Every call here used to end in `catch { return MOCK_… }`. That turned an
// outage, a 404 and an auth failure into a page full of confident, invented
// revenue figures — the worst possible failure mode for a screen a seller uses
// to decide what to stock and what to charge. `/analytics/sales` and
// `/analytics/top-products` did not exist at all until recently, so the mock
// was what every seller saw, every time.
//
// Errors now propagate. The caller decides what to show.

export interface DailySalesData {
  date: string;
  revenue: number;
  orders: number;
  units: number;
}

export interface TopProduct {
  productId: string;
  name: string;
  revenue: number;
  unitsSold: number;
  views: number;
}

export interface AnalyticsOverview {
  totalRevenue: number;
  revenueGrowth: number;
  totalOrders: number;
  ordersGrowth: number;
  avgOrderValue: number;
  conversionRate: number;
  totalViews: number;
  returningCustomers: number;
}

/**
 * A result that may be legitimately empty *because the pipeline does not exist
 * yet*, as opposed to empty because the seller has no sales.
 *
 * analytics-service answers `/analytics/sales` and `/analytics/top-products`
 * with `{ data: [], meta: { pending: true, reason } }` — it keeps its counters
 * in memory and has no per-seller aggregation. Carrying that flag through lets
 * the UI say "not available yet" instead of "you sold nothing", which are very
 * different messages to put in front of a seller.
 */
export interface PendingAware<T> {
  items: T[];
  pending: boolean;
  reason?: string;
}

interface PendingEnvelope<T> {
  data: T[];
  meta?: { pending?: boolean; reason?: string };
}

export const analyticsApi = {
  async getOverview(): Promise<AnalyticsOverview> {
    const { data } = await apiClient.get<{ data: AnalyticsOverview }>('/analytics/overview');
    return data.data;
  },

  async getSalesData(days = 30): Promise<PendingAware<DailySalesData>> {
    const { data } = await apiClient.get<PendingEnvelope<DailySalesData>>('/analytics/sales', {
      params: { days },
    });
    return {
      items: data.data ?? [],
      pending: data.meta?.pending === true,
      reason: data.meta?.reason,
    };
  },

  async getTopProducts(limit = 5): Promise<PendingAware<TopProduct>> {
    const { data } = await apiClient.get<PendingEnvelope<TopProduct>>('/analytics/top-products', {
      params: { limit },
    });
    return {
      items: data.data ?? [],
      pending: data.meta?.pending === true,
      reason: data.meta?.reason,
    };
  },
};
