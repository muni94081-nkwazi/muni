import { apiClient, type ApiEnvelope } from './client';
import type { CartItem } from '@/types';

// cart-service returns the WHOLE cart from every mutating call, enveloped as
// `{ success, data }`. There is no separate "summary" or "coupon" object — this
// file previously described one, so `summary` and `coupon` were always
// undefined and the screen fell back to hardcoded numbers.
//
// Mutations address a cart LINE by its own `id`, not by productId: the same
// product in two variants is two lines. The old signatures passed productId,
// which cart-service reads as an unknown itemId.

/** Exactly what `GET /api/v1/cart` returns (CartSchema in cart-service). */
export interface Cart {
  userId: string;
  items: CartItem[];
  couponCode?: string;
  couponDiscount: number;
  /** Set when a code was rejected or could not be checked — worth surfacing. */
  couponMessage?: string;
  subtotal: number;
  itemCount: number;
  updatedAt: string;
  expiresAt: string;
}

/**
 * cart-service stores a denormalised snapshot, so adding requires more than a
 * productId — it will 400 on a partial body. The caller (a product screen) has
 * all of this already; the cart screen never adds.
 */
export interface AddCartItemInput {
  productId: string;
  sellerId: string;
  productName: string;
  productImage: string;
  price: number;
  quantity: number;
  maxQuantity: number;
  variantId?: string;
  variantLabel?: string;
  weight?: number;
}

export const cartApi = {
  getCart: async (): Promise<Cart> => {
    const { data } = await apiClient.get<ApiEnvelope<Cart>>('/api/v1/cart');
    return data.data;
  },

  addItem: async (input: AddCartItemInput): Promise<Cart> => {
    const { data } = await apiClient.post<ApiEnvelope<Cart>>('/api/v1/cart/items', input);
    return data.data;
  },

  /**
   * PATCH, not PUT, and keyed on the cart-line id.
   * A quantity of 0 removes the line — that is the service's documented
   * behaviour (`UpdateItemQuantitySchema` allows 0), not a client convention.
   */
  updateItem: async (itemId: string, quantity: number): Promise<Cart> => {
    const { data } = await apiClient.patch<ApiEnvelope<Cart>>(
      `/api/v1/cart/items/${itemId}`,
      { quantity },
    );
    return data.data;
  },

  removeItem: async (itemId: string): Promise<Cart> => {
    const { data } = await apiClient.delete<ApiEnvelope<Cart>>(`/api/v1/cart/items/${itemId}`);
    return data.data;
  },

  /** Returns 204 with no body, so there is no cart to hand back. */
  clearCart: async (): Promise<void> => {
    await apiClient.delete('/api/v1/cart');
  },

  applyCoupon: async (code: string): Promise<Cart> => {
    const { data } = await apiClient.post<ApiEnvelope<Cart>>('/api/v1/cart/coupon', { code });
    return data.data;
  },

  removeCoupon: async (): Promise<Cart> => {
    const { data } = await apiClient.delete<ApiEnvelope<Cart>>('/api/v1/cart/coupon');
    return data.data;
  },
};
