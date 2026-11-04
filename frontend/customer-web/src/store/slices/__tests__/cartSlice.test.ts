import { describe, expect, it, vi, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import type { Cart } from '@/types/cart.types';

// Mocked before importing the slice so the thunks pick up the stub.
vi.mock('@/api/cart.api', () => ({
  cartApi: {
    getCart: vi.fn(),
    addItem: vi.fn(),
    updateItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    applyCoupon: vi.fn(),
    removeCoupon: vi.fn(),
  },
}));

import { cartApi } from '@/api/cart.api';
import cartReducer, { fetchCart, removeCartItem, updateCartItem } from '../cartSlice';

function makeCart(): Cart {
  return {
    id: 'cart-1',
    userId: 'user-1',
    sessionId: null,
    currency: 'UGX',
    couponCode: null,
    discountAmount: 0,
    subtotal: 30_000,
    total: 30_000,
    status: 'ACTIVE',
    itemCount: 2,
    totalUnits: 3,
    hasUnavailableItems: false,
    expiresAt: null,
    lastActivityAt: null,
    items: [
      {
        id: 'item-a',
        productId: 'p-a',
        vendorId: 'v-1',
        productName: 'Kabejja Soap',
        productSku: 'SKU-A',
        productImageUrl: null,
        unitPrice: 10_000,
        quantity: 1,
        lineTotal: 10_000,
        isAvailable: true,
        stockSnapshot: 5,
        exceedsAvailableStock: false,
      },
      {
        id: 'item-b',
        productId: 'p-b',
        vendorId: 'v-2',
        productName: 'Tecno Spark',
        productSku: 'SKU-B',
        productImageUrl: null,
        unitPrice: 10_000,
        quantity: 2,
        lineTotal: 20_000,
        isAvailable: true,
        stockSnapshot: 9,
        exceedsAvailableStock: false,
      },
    ],
  };
}

function makeStore(cart: Cart | null = makeCart()) {
  const store = configureStore({ reducer: { cart: cartReducer } });
  if (cart) {
    // Seed through a real fulfilled fetch so we exercise the same path the app does.
    vi.mocked(cartApi.getCart).mockResolvedValueOnce(cart);
    return store.dispatch(fetchCart()).then(() => store);
  }
  return Promise.resolve(store);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('optimistic quantity change', () => {
  it('updates the row and totals before the server responds', async () => {
    const store = await makeStore();

    let resolveUpdate: (cart: Cart) => void = () => {};
    vi.mocked(cartApi.updateItem).mockReturnValueOnce(
      new Promise<Cart>((resolve) => {
        resolveUpdate = resolve;
      }),
    );

    const inFlight = store.dispatch(updateCartItem({ itemId: 'item-a', quantity: 3 }));

    // Server has NOT replied yet — the UI must already show the new numbers.
    const optimistic = store.getState().cart;
    expect(optimistic.cart?.items.find((i) => i.id === 'item-a')?.quantity).toBe(3);
    expect(optimistic.cart?.items.find((i) => i.id === 'item-a')?.lineTotal).toBe(30_000);
    expect(optimistic.cart?.subtotal).toBe(50_000);
    expect(optimistic.cart?.totalUnits).toBe(5);

    // …and only this row is marked pending.
    expect(optimistic.pendingItemIds).toEqual(['item-a']);
    expect(optimistic.status).not.toBe('loading');

    const serverCart = makeCart();
    serverCart.items[0].quantity = 3;
    serverCart.items[0].lineTotal = 30_000;
    serverCart.subtotal = 50_000;
    resolveUpdate(serverCart);
    await inFlight;

    const settled = store.getState().cart;
    expect(settled.pendingItemIds).toEqual([]);
    expect(settled.rollbackSnapshot).toBeNull();
    expect(settled.cart?.subtotal).toBe(50_000);
  });

  it('does not freeze other rows while one row is in flight', async () => {
    const store = await makeStore();
    vi.mocked(cartApi.updateItem).mockReturnValueOnce(new Promise<Cart>(() => {}));

    store.dispatch(updateCartItem({ itemId: 'item-a', quantity: 2 }));

    const { pendingItemIds } = store.getState().cart;
    expect(pendingItemIds).toContain('item-a');
    expect(pendingItemIds).not.toContain('item-b');
  });

  it('rolls back to the pre-mutation cart when the server rejects', async () => {
    const store = await makeStore();
    const before = store.getState().cart.cart;

    vi.mocked(cartApi.updateItem).mockRejectedValueOnce(new Error('stock conflict'));
    await store.dispatch(updateCartItem({ itemId: 'item-a', quantity: 99 }));

    const after = store.getState().cart;
    expect(after.cart).toEqual(before);
    expect(after.pendingItemIds).toEqual([]);
    expect(after.rollbackSnapshot).toBeNull();
    expect(after.error).toBeTruthy();
  });
});

describe('optimistic remove', () => {
  it('drops the row immediately and restores it on failure', async () => {
    const store = await makeStore();

    vi.mocked(cartApi.removeItem).mockRejectedValueOnce(new Error('network down'));
    const inFlight = store.dispatch(removeCartItem('item-b'));

    // Gone from the UI right away.
    expect(store.getState().cart.cart?.items.map((i) => i.id)).toEqual(['item-a']);

    await inFlight;

    // Server said no — the row comes back rather than silently vanishing.
    expect(store.getState().cart.cart?.items.map((i) => i.id)).toEqual(['item-a', 'item-b']);
    expect(store.getState().cart.cart?.subtotal).toBe(30_000);
  });
});

describe('fetchCart condition guard', () => {
  it('collapses a burst of concurrent mounts into one request', async () => {
    const store = configureStore({ reducer: { cart: cartReducer } });
    vi.mocked(cartApi.getCart).mockResolvedValue(makeCart());

    // Simulates CartIcon + CartSummary + CartDrawer + N CartItem rows all
    // mounting in the same commit and each calling fetchCart().
    await Promise.all([
      store.dispatch(fetchCart()),
      store.dispatch(fetchCart()),
      store.dispatch(fetchCart()),
      store.dispatch(fetchCart()),
      store.dispatch(fetchCart()),
    ]);

    expect(cartApi.getCart).toHaveBeenCalledTimes(1);
  });
});
