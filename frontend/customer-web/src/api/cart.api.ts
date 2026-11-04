import { apiClient } from './axios.config';
import type { ApiEnvelope } from '@/types/api.types';
import type { AddCartItemPayload, Cart, CartItem, UpdateCartItemPayload } from '@/types/cart.types';

// ─── Backend response shape ───────────────────────────────────────────────────
// cart-service's Cart/CartItem (backend/services/cart-service/src/models/cart.model.ts)
// is a different, flatter shape than the frontend's Cart/CartItem types below —
// this adapter is the single place that bridges the two so every other
// component can keep using the richer frontend-native shape.
interface BackendCartItem {
  id: string;
  productId: string;
  sellerId: string;
  productName: string;
  productImage: string;
  variantId?: string;
  variantLabel?: string;
  price: number;
  quantity: number;
  maxQuantity: number;
  addedAt: string;
}

interface BackendCart {
  userId: string;
  items: BackendCartItem[];
  couponCode?: string;
  couponDiscount: number;
  subtotal: number;
  itemCount: number;
  updatedAt: string;
  expiresAt: string;
}

function toFrontendCart(raw: BackendCart): Cart {
  const items: CartItem[] = raw.items.map((item) => ({
    id: item.id,
    productId: item.productId,
    vendorId: item.sellerId,
    productName: item.productName,
    productSku: item.variantId ?? item.productId,
    productImageUrl: item.productImage || null,
    unitPrice: item.price,
    quantity: item.quantity,
    lineTotal: item.price * item.quantity,
    isAvailable: true,
    stockSnapshot: item.maxQuantity,
    exceedsAvailableStock: item.quantity > item.maxQuantity,
  }));

  const isGuest = raw.userId.startsWith('guest');
  const discountAmount = raw.couponDiscount ?? 0;

  return {
    id: raw.userId,
    userId: isGuest ? null : raw.userId,
    sessionId: raw.userId.startsWith('guest:') ? raw.userId.slice('guest:'.length) : null,
    currency: 'UGX',
    couponCode: raw.couponCode ?? null,
    discountAmount,
    subtotal: raw.subtotal,
    total: Math.max(0, raw.subtotal - discountAmount),
    status: 'active',
    itemCount: raw.itemCount,
    totalUnits: raw.itemCount,
    hasUnavailableItems: items.some((item) => item.exceedsAvailableStock),
    items,
    expiresAt: raw.expiresAt ?? null,
    lastActivityAt: raw.updatedAt ?? null,
  };
}

export const cartApi = {
  async getCart(): Promise<Cart> {
    const { data } = await apiClient.get<ApiEnvelope<BackendCart>>('/cart');
    return toFrontendCart(data.data);
  },

  async refresh(): Promise<Cart> {
    const { data } = await apiClient.post<ApiEnvelope<BackendCart>>('/cart/refresh');
    return toFrontendCart(data.data);
  },

  async clear(): Promise<Cart> {
    await apiClient.delete('/cart');
    return this.getCart();
  },

  async addItem(payload: AddCartItemPayload): Promise<Cart> {
    const { data } = await apiClient.post<ApiEnvelope<BackendCart>>('/cart/items', {
      productId: payload.productId,
      sellerId: payload.sellerId,
      productName: payload.productName,
      productImage: payload.productImage,
      price: payload.price,
      quantity: payload.quantity,
      maxQuantity: payload.maxQuantity,
      variantId: payload.variantId,
      variantLabel: payload.variantLabel,
      weight: payload.weight,
    });
    return toFrontendCart(data.data);
  },

  async updateItem(itemId: string, payload: UpdateCartItemPayload): Promise<Cart> {
    const { data } = await apiClient.patch<ApiEnvelope<BackendCart>>(`/cart/items/${itemId}`, {
      quantity: payload.quantity,
    });
    return toFrontendCart(data.data);
  },

  async removeItem(itemId: string): Promise<Cart> {
    const { data } = await apiClient.delete<ApiEnvelope<BackendCart>>(`/cart/items/${itemId}`);
    return toFrontendCart(data.data);
  },

  async applyCoupon(code: string): Promise<Cart> {
    const { data } = await apiClient.post<ApiEnvelope<BackendCart>>('/cart/coupon', { code });
    return toFrontendCart(data.data);
  },

  async removeCoupon(): Promise<Cart> {
    const { data } = await apiClient.delete<ApiEnvelope<BackendCart>>('/cart/coupon');
    return toFrontendCart(data.data);
  },

  async mergeGuestCart(sessionId: string): Promise<Cart> {
    const { data } = await apiClient.post<ApiEnvelope<BackendCart>>('/cart/merge', { sessionId });
    return toFrontendCart(data.data);
  },
};
