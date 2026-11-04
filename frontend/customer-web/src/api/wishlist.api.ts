import { apiClient } from './axios.config';
import type { ApiEnvelope } from '@/types/api.types';

// ─── Wishlist API ─────────────────────────────────────────────────────────────
//
// Talks to wishlist-service through the gateway's `auth('/wishlists')` mount,
// which verifies the JWT and stamps the caller's id downstream. No user id is
// ever sent from here: wishlist-service scopes every read and write to the
// stamped identity, and looks each wishlist up by (userId, wishlistId) so one
// customer cannot touch another's list. A userId in the body would be ignored
// at best and a tampering vector at worst.
//
// Responses are enveloped as `{ success, data }`, matching the mobile client.

export interface WishlistItem {
  id: string;
  productId: string;
  productName: string;
  productImage: string;
  price: number;
  /** ISO string over the wire. */
  addedAt: string;
  /** What it cost when it was saved — the pair below drives the price-drop badge. */
  priceAtAdd: number;
  currentPrice: number;
}

export interface Wishlist {
  id: string;
  userId: string;
  name: string;
  isPublic: boolean;
  items: WishlistItem[];
  createdAt: string;
  updatedAt: string;
}

/**
 * wishlist-service stores a denormalised snapshot rather than a bare productId,
 * which is what lets the list render without one product lookup per row.
 */
export interface AddWishlistItemInput {
  productId: string;
  productName: string;
  productImage: string;
  price: number;
}

/** The list a shopper means when they say "my wishlist". */
export const DEFAULT_WISHLIST_NAME = 'My Wishlist';

export const wishlistApi = {
  async list(): Promise<Wishlist[]> {
    const { data } = await apiClient.get<ApiEnvelope<Wishlist[]>>('/wishlists');
    return data.data;
  },

  async create(name: string = DEFAULT_WISHLIST_NAME, isPublic = false): Promise<Wishlist> {
    const { data } = await apiClient.post<ApiEnvelope<Wishlist>>('/wishlists', { name, isPublic });
    return data.data;
  },

  /** Returns the whole updated wishlist, not just the added item. */
  async addItem(wishlistId: string, item: AddWishlistItemInput): Promise<Wishlist> {
    const { data } = await apiClient.post<ApiEnvelope<Wishlist>>(
      `/wishlists/${wishlistId}/items`,
      item,
    );
    return data.data;
  },

  async removeItem(wishlistId: string, itemId: string): Promise<Wishlist> {
    const { data } = await apiClient.delete<ApiEnvelope<Wishlist>>(
      `/wishlists/${wishlistId}/items/${itemId}`,
    );
    return data.data;
  },
};

/**
 * The wishlist to save into, creating one on first use.
 *
 * The service models several named lists per customer, but the storefront only
 * ever talks about "my wishlist" — so a shopper who has never made one should
 * not have to. Uses the existing create endpoint; there is no separate
 * "default wishlist" API and this does not invent one.
 */
export async function resolveDefaultWishlist(): Promise<Wishlist> {
  const existing = await wishlistApi.list();
  if (existing.length > 0) return existing[0];
  return wishlistApi.create();
}
