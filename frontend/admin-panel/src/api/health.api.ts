import { apiClient } from './axios.config';
import type { ServiceHealthRecord } from '@/types/health.types';
import type { ApiEnvelope } from '@/types/api.types';

export const healthApi = {
  // Gateway-side aggregator (backend/api-gateway/src/routes/admin.routes.ts)
  // pings every registered service's /health/live server-to-server and
  // returns their real current status in one response.
  getServiceHealth: async (): Promise<ApiEnvelope<ServiceHealthRecord[]>> => {
    const { data } = await apiClient.get<{
      success: boolean;
      data: Array<{ name: string; status: 'healthy' | 'down'; latencyMs: number }>;
      meta: { checkedAt: string };
    }>('/admin/system/health');

    return {
      success: data.success,
      data: data.data.map((svc) => ({
        name: svc.name,
        status: svc.status,
        latencyMs: svc.latencyMs,
        lastCheckedAt: data.meta.checkedAt,
      })),
    };
  },
};
