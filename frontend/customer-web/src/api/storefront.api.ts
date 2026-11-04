import { apiClient } from './axios.config';
import type { ApiEnvelope } from '@/types/api.types';

// ─── Public seller storefront ─────────────────────────────────────────────────
//
// Reads marketplace-service through the gateway's `pub('/marketplace')` mount.
// Deliberately unauthenticated: a storefront is a shop window, and requiring a
// session to look at one would be wrong.
//
// The endpoint resolves a slug OR an id (`findBySlugOrId`), which is why the
// existing /store/:sellerId route keeps working unchanged.
//
// Only the fields marketplace-service publishes are typed here. `commissionRate`
// and `status` are deliberately absent — the service now strips the commission
// from public responses and 404s a store that is not ACTIVE.

export interface StoreLocation {
  city?: string;
  country?: string;
}

export interface PublicStore {
  id: string;
  /** The seller's user id — the key their products are filed under. */
  userId: string;
  storeName: string;
  storeSlug: string;
  description: string;
  logo: string | null;
  banner: string | null;
  categories: string[];
  location: StoreLocation | null;
  rating: number;
  reviewCount: number;
  totalSales: number;
  verificationStatus: string;
  joinedAt: string;
}

/**
 * In-flight and settled lookups, keyed by whatever was asked for.
 *
 * The product page resolves a store from the product's sellerId, so browsing a
 * catalogue asks for the same handful of sellers over and over — and several
 * components on one page can ask at the same moment. Caching the promise rather
 * than the value collapses those into a single request, including the
 * concurrent ones.
 *
 * Rejections are evicted so a store that failed once is retried on the next
 * visit rather than being remembered as permanently missing. Lives for the
 * page's lifetime; a reload gets fresh data.
 */
const storeCache = new Map<string, Promise<PublicStore>>();

export const storefrontApi = {
  /**
   * One public storefront. Throws with a 404 response when the slug or id does
   * not resolve, or when the store is not trading — the caller renders a
   * not-found state from that.
   *
   * Accepts a store slug, a store id, or the owning seller's user id, which is
   * the `sellerId` a product carries.
   */
  async getStore(slugOrId: string): Promise<PublicStore> {
    const cached = storeCache.get(slugOrId);
    if (cached) return cached;

    const request = apiClient
      .get<ApiEnvelope<PublicStore>>(`/marketplace/stores/${encodeURIComponent(slugOrId)}`)
      .then((res) => res.data.data);

    storeCache.set(slugOrId, request);
    request.catch(() => storeCache.delete(slugOrId));

    return request;
  },
};
