import { apiClient } from './axios.config';
import type { ApiEnvelope } from '@/types/api.types';

export interface RecommendedProduct {
  productId: string;
  score: number;
  reason: string;
}

/**
 * Recommendations are a non-critical enhancement: an empty carousel is a fine
 * outcome, a stalled page is not. Without a per-call override these inherit
 * apiClient's global 15 s timeout, so a *slow* (rather than dead) recommendation
 * service — GC pause, cold cache, saturated connection pool — held the PDP's
 * skeleton on screen for 15 seconds before degrading.
 */
const RECS_TIMEOUT_MS = 1_500;

/**
 * Fire-and-forget telemetry. Nothing renders from it, so it gets the tightest
 * budget of all. This matters more than it looks: browsers cap ~6 concurrent
 * connections per origin over HTTP/1.1, so events hanging for 15 s each could
 * starve the requests that actually paint the page.
 */
const TELEMETRY_TIMEOUT_MS = 300;

export const recommendationsApi = {
  async getForUser(userId?: string, limit = 10, context: 'home' | 'cart' | 'pdp' = 'home'): Promise<RecommendedProduct[]> {
    try {
      const { data } = await apiClient.get<ApiEnvelope<RecommendedProduct[]>>('/recommendations/products', {
        params: { userId, limit, context },
        timeout: RECS_TIMEOUT_MS,
      });
      return data.data;
    } catch {
      return [];
    }
  },

  async getTrending(): Promise<RecommendedProduct[]> {
    try {
      const { data } = await apiClient.get<ApiEnvelope<RecommendedProduct[]>>('/recommendations/trending', {
        timeout: RECS_TIMEOUT_MS,
      });
      return data.data;
    } catch {
      return [];
    }
  },

  async getSimilar(productId: string): Promise<RecommendedProduct[]> {
    try {
      const { data } = await apiClient.get<ApiEnvelope<RecommendedProduct[]>>(
        `/recommendations/similar/${productId}`,
        { timeout: RECS_TIMEOUT_MS },
      );
      return data.data;
    } catch {
      return [];
    }
  },

  async trackEvent(userId: string, productId: string, event: 'view' | 'add_to_cart' | 'purchase'): Promise<void> {
    try {
      await apiClient.post(
        '/recommendations/events',
        { userId, productId, event },
        { timeout: TELEMETRY_TIMEOUT_MS },
      );
    } catch {
      // non-critical — swallow error silently
    }
  },
};
