import { apiClient, type ApiEnvelope } from './client';
import { productsApi } from './products.api';
import type { Product } from '@/types';

/**
 * recommendation-service, mounted publicly by the gateway
 * (`pub('/recommendations', targets.recommendation)`), so it works signed-out.
 *
 * The service returns scored *references* — productId plus an optional name,
 * price and image — not whole products, so its rows cannot be handed to
 * ProductCard directly. `recommendedProducts` below resolves them to the real
 * catalogue records instead of rendering half a card from optional fields.
 */

export type RecommendationReason =
  | 'also_viewed'
  | 'also_bought'
  | 'frequently_bought_together'
  | 'personalized'
  | 'trending'
  | 'popular';

export interface RecommendationItem {
  productId: string;
  score: number;
  reason: RecommendationReason;
  category?: string;
  name?: string;
  price?: number;
  imageUrl?: string;
}

export const recommendationsApi = {
  /** Needs an identity to mean anything; the gateway stamps it when signed in. */
  personalized: async (limit = 10): Promise<RecommendationItem[]> => {
    const { data } = await apiClient.get<ApiEnvelope<RecommendationItem[]>>(
      '/api/v1/recommendations/personalized',
      { params: { limit } },
    );
    return data.data ?? [];
  },

  /** Identity-free, so this is what a guest gets. */
  trending: async (limit = 10): Promise<RecommendationItem[]> => {
    const { data } = await apiClient.get<ApiEnvelope<RecommendationItem[]>>(
      '/api/v1/recommendations/trending',
      { params: { limit } },
    );
    return data.data ?? [];
  },
};

/**
 * Recommendations as full catalogue products, ready for ProductCard.
 *
 * Signed-in shoppers get the personalized strategy; guests get trending, since
 * personalization keyed to no user is just noise. Each reference is resolved
 * through the normal product endpoint and anything that fails to resolve is
 * dropped — a recommendation pointing at a delisted product should vanish, not
 * render as a blank tile.
 */
export async function recommendedProducts(
  isAuthenticated: boolean,
  limit = 6,
): Promise<Product[]> {
  const items = isAuthenticated
    ? await recommendationsApi.personalized(limit)
    : await recommendationsApi.trending(limit);

  const ids = items.map((i) => i.productId).filter(Boolean).slice(0, limit);
  if (ids.length === 0) return [];

  const settled = await Promise.allSettled(ids.map((id) => productsApi.getProductById(id)));
  return settled
    .filter((r): r is PromiseFulfilledResult<Product> => r.status === 'fulfilled' && !!r.value)
    .map((r) => r.value);
}
