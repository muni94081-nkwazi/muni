import { apiClient } from './axios.config';
import type {
  DashboardStats,
  DashboardStatsMeta,
  DashboardStatsResult,
  RecentOrder,
  RecentSeller,
} from '@/types/dashboard.types';

// ─── Admin Dashboard API ──────────────────────────────────────────────────────
//
// Every call goes to /api/v1/admin/dashboard/*, gated at the gateway by
// requireRole('ROLE_ADMIN', 'ROLE_SUPER_ADMIN'). Nothing here is scoped by
// x-user-id — an admin sees platform-wide figures.
//
// /stats is answered by the gateway itself, which fans out to order-service,
// auth-service and product-service in parallel. A service that fails is
// reported in meta.degraded with its numbers zeroed, so callers can distinguish
// "nothing happened yet" from "we could not find out".

export const dashboardApi = {
  getStats: async (): Promise<DashboardStatsResult> => {
    const { data } = await apiClient.get<{ data: DashboardStats; meta: DashboardStatsMeta }>(
      '/admin/dashboard/stats',
    );
    return { stats: data.data, meta: data.meta };
  },

  /** Newest master orders platform-wide, with their per-seller breakdown intact. */
  getRecentOrders: async (limit = 10): Promise<RecentOrder[]> => {
    const { data } = await apiClient.get<{ data: RecentOrder[] }>('/admin/dashboard/recent-orders', {
      params: { limit },
    });
    return data.data;
  },

  /**
   * Newest seller applications. Defaults to the pending queue — a seller
   * verified months ago is not activity an admin needs to act on. Pass
   * `status: 'all'` for the unfiltered feed.
   */
  getRecentSellers: async (limit = 10, status?: RecentSeller['verificationStatus'] | 'all'): Promise<RecentSeller[]> => {
    const { data } = await apiClient.get<{ data: RecentSeller[] }>('/admin/dashboard/recent-sellers', {
      params: { limit, status },
    });
    return data.data;
  },
};
