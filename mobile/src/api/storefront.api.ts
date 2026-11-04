import { apiClient, type ApiEnvelope } from './client';

// ─── Marketplace storefronts ──────────────────────────────────────────────────
//
// product-service carries only `sellerId` — the seller's user id. The shop name,
// logo and rating a shopper actually reads live in marketplace-service, which
// owns them.
//
// So the store is fetched separately rather than denormalised onto the product:
// one owner for store data, and no product-service → marketplace-service
// dependency on the hot catalogue path.
//
// The endpoint is public (`pub('/marketplace', …)` at the gateway), already
// hides suspended stores, and already omits commission data — so a signed-out
// shopper can see who they are buying from.

export interface PublicStore {
  id: string;
  /** The seller's user id — the value a product's `sellerId` holds. */
  userId: string;
  storeName: string;
  storeSlug: string;
  description: string;
  logo: string | null;
  banner: string | null;
  rating: number;
  reviewCount: number;
  totalSales: number;
  verificationStatus: string;
  joinedAt: string;
}

/**
 * In-flight and settled lookups, keyed by what was asked for.
 *
 * A catalogue screen renders many cards from the same few sellers, and the
 * product screen asks again on open. Caching the promise — not the value —
 * collapses concurrent asks into one request too.
 *
 * Rejections are evicted so a transient failure is retried rather than
 * remembered as "this seller has no shop".
 */
const cache = new Map<string, Promise<PublicStore>>();

export const storefrontApi = {
  /**
   * One public storefront, by store slug, store id, or the owning seller's
   * user id — which is what a product's `sellerId` is.
   *
   * Rejects with a 404 when the seller has no public store. That is ordinary:
   * a seller can list products without setting up a shop page, so callers
   * should treat it as "no store to show", not as an error.
   */
  async getStore(slugOrId: string): Promise<PublicStore> {
    const hit = cache.get(slugOrId);
    if (hit) return hit;

    const request = apiClient
      .get<ApiEnvelope<PublicStore>>(`/api/v1/marketplace/stores/${encodeURIComponent(slugOrId)}`)
      .then((res) => res.data.data);

    cache.set(slugOrId, request);
    request.catch(() => cache.delete(slugOrId));

    return request;
  },
};
