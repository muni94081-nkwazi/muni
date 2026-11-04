import { apiClient } from './axios.config';
import type { StorefrontConfig } from '@/types/storefront.types';

// ─── Backing store, and what it cannot yet hold ───────────────────────────────
//
// GET/PATCH /api/v1/seller/marketplace/my-store → marketplace-service.
// (Those seller-prefixed routes were added alongside this client; the service
// previously served /api/v1/marketplace/my-store only, while the gateway
// forwards the /seller-prefixed original URL verbatim — so every call 404'd,
// which is why this module used to be a fixture.)
//
// The Store model carries: storeName, storeSlug, description, logo, banner
// (ONE url), categories, location, plus read-only rating/sales counters.
//
// It has NO column for `banners[]`, `carousel[]`, `themeColor` or `bannerHtml`.
// Those four parts of StorefrontConfig therefore do not round-trip: they are
// returned as whatever the caller last held in memory and are dropped on save.
// That is a real gap, not an oversight here — persisting them needs new columns
// on Store. `saveConfig` reports it through `unsupportedFields` rather than
// silently discarding the seller's work, which is what a fixture would do.

interface ServiceStore {
  id: string;
  userId: string;
  storeName: string;
  storeSlug: string;
  description: string;
  logo?: string;
  banner?: string;
  categories: string[];
  location: { city: string; country: string };
  rating: number;
  reviewCount: number;
  totalSales: number;
  status: string;
  verificationStatus: string;
}

/** Fields StorefrontConfig declares that the Store model cannot store. */
export const UNPERSISTED_FIELDS = ['banners', 'carousel', 'themeColor', 'bannerHtml'] as const;

const DEFAULT_THEME = '#FF6B35';

/**
 * Which parts of this config the backend cannot keep.
 *
 * Exported as a standalone check rather than folded into `saveConfig`'s return
 * type, so callers keep the plain `StorefrontConfig` contract. A page that
 * wants to warn the seller ("your carousel will not be saved") can call this
 * before saving; nothing is forced to.
 */
export function unsupportedFieldsFor(config: StorefrontConfig): string[] {
  return UNPERSISTED_FIELDS.filter((field) => {
    if (field === 'banners') return (config.banners?.length ?? 0) > 1;
    if (field === 'carousel') return (config.carousel?.length ?? 0) > 0;
    if (field === 'themeColor') return !!config.themeColor && config.themeColor !== DEFAULT_THEME;
    return !!config.bannerHtml;
  });
}

function toConfig(store: ServiceStore, previous?: StorefrontConfig): StorefrontConfig {
  return {
    storeName: store.storeName,
    customUrlSlug: store.storeSlug,
    // The single `banner` url is the only banner the model holds; surface it as
    // the first entry so an existing banner is not invisible in the editor.
    banners:
      previous?.banners?.length
        ? previous.banners
        : store.banner
          ? [{ id: 'store-banner', imageUrl: store.banner, headline: '', linkUrl: '', order: 0 }]
          : [],
    carousel: previous?.carousel ?? [],
    themeColor: previous?.themeColor ?? DEFAULT_THEME,
    bannerHtml: previous?.bannerHtml,
  };
}

export const storefrontApi = {
  async getConfig(): Promise<StorefrontConfig> {
    const { data } = await apiClient.get<{ success: boolean; data: ServiceStore }>(
      '/seller/marketplace/my-store',
    );
    return toConfig(data.data);
  },

  /**
   * PATCH, not POST — POST creates a store and 400s when one already exists.
   * Only the mappable fields are sent; anything the model has no column for is
   * named in the result instead of being quietly dropped.
   */
  async saveConfig(config: StorefrontConfig): Promise<StorefrontConfig> {
    const { data } = await apiClient.patch<{ success: boolean; data: ServiceStore }>(
      '/seller/marketplace/my-store',
      {
        storeName: config.storeName,
        storeSlug: config.customUrlSlug,
        // First banner only — the model holds one url.
        ...(config.banners?.[0]?.imageUrl ? { banner: config.banners[0].imageUrl } : {}),
      },
    );

    // Loud rather than silent: the seller pressed Save and part of it did not
    // persist. Surfacing this in the UI needs `unsupportedFieldsFor` above.
    const dropped = unsupportedFieldsFor(config);
    if (dropped.length > 0) {
      console.warn(
        `[storefront] Saved, but marketplace-service has no column for: ${dropped.join(', ')}. ` +
        'These will not survive a reload.',
      );
    }

    return toConfig(data.data, config);
  },
};
