import { apiClient, type ApiEnvelope } from './client';

// wishlist-service enveloped every response (`{ success, data }`), unlike the
// auth endpoints — so these DO unwrap `.data`. See the note in auth.api.ts.

export interface WishlistItem {
  id: string;
  productId: string;
  productName: string;
  productImage: string;
  price: number;
  /** ISO strings over the wire; the service types these as Date internally. */
  addedAt: string;
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
 * Everything the service needs to render a row later. It stores a denormalised
 * snapshot rather than just a productId, which is what lets the list render
 * without N product lookups — and what makes `priceAtAdd` vs `currentPrice`
 * (the price-drop badge) possible.
 */
export interface AddWishlistItemInput {
  productId: string;
  productName: string;
  productImage: string;
  price: number;
}

export const wishlistApi = {
  list: async (): Promise<Wishlist[]> => {
    const { data } = await apiClient.get<ApiEnvelope<Wishlist[]>>('/api/v1/wishlists');
    return data.data;
  },

  create: async (name: string, isPublic = false): Promise<Wishlist> => {
    const { data } = await apiClient.post<ApiEnvelope<Wishlist>>('/api/v1/wishlists', {
      name,
      isPublic,
    });
    return data.data;
  },

  /** Returns the whole updated wishlist, not just the new item. */
  addItem: async (wishlistId: string, item: AddWishlistItemInput): Promise<Wishlist> => {
    const { data } = await apiClient.post<ApiEnvelope<Wishlist>>(
      `/api/v1/wishlists/${wishlistId}/items`,
      item,
    );
    return data.data;
  },

  removeItem: async (wishlistId: string, itemId: string): Promise<Wishlist> => {
    const { data } = await apiClient.delete<ApiEnvelope<Wishlist>>(
      `/api/v1/wishlists/${wishlistId}/items/${itemId}`,
    );
    return data.data;
  },
};
