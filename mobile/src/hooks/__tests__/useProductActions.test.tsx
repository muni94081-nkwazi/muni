jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), push: jest.fn() } }));

jest.mock('@/api/cart.api', () => ({ cartApi: { addItem: jest.fn() } }));
jest.mock('@/api/wishlist.api', () => ({
  wishlistApi: { list: jest.fn(), create: jest.fn(), addItem: jest.fn(), removeItem: jest.fn() },
}));

import React from 'react';
import { act, create } from 'react-test-renderer';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { router } from 'expo-router';
import { cartApi } from '@/api/cart.api';
import { wishlistApi } from '@/api/wishlist.api';
import authReducer, { setTokens } from '@/store/auth.slice';
import cartReducer from '@/store/cart.slice';
import wishlistReducer from '@/store/wishlist.slice';
import { useProductActions } from '../useProductActions';
import type { Product } from '@/types';

const mockCartApi = cartApi as jest.Mocked<typeof cartApi>;
const mockWishlistApi = wishlistApi as jest.Mocked<typeof wishlistApi>;

const PRODUCT: Product = {
  id: 'p1',
  name: 'Kampala Coffee',
  description: '',
  price: 15000,
  currency: 'UGX',
  imageUrls: ['https://cdn.example/coffee.jpg'],
  category: { id: 'c1', name: 'Food', slug: 'food' },
  categoryId: 'c1',
  sellerId: 's1',
  averageRating: 4.8,
  reviewCount: 12,
  stockQuantity: 7,
  inStock: true,
  tags: [],
  createdAt: new Date().toISOString(),
};

function makeStore(signedIn: boolean) {
  const store = configureStore({
    reducer: { auth: authReducer, cart: cartReducer, wishlist: wishlistReducer },
  });
  if (signedIn) {
    store.dispatch(setTokens({ accessToken: 'access-token', refreshToken: 'refresh-token' }));
  }
  return store;
}

/** Renders the hook and hands its API back for the test to drive. */
function renderActions(signedIn: boolean, returnTo = '/product/p1') {
  const store = makeStore(signedIn);
  let api!: ReturnType<typeof useProductActions>;

  function Probe() {
    api = useProductActions(returnTo);
    return null;
  }

  act(() => {
    create(
      <Provider store={store}>
        <Probe />
      </Provider>,
    );
  });

  return { store, get api() { return api; } };
}

describe('useProductActions when signed out', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sends an Add to Cart to login with the product as the destination', async () => {
    const rendered = renderActions(false);

    let result: boolean | undefined;
    await act(async () => {
      result = await rendered.api.addToCart(PRODUCT);
    });

    expect(result).toBe(false);
    expect(mockCartApi.addItem).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/(auth)/login',
      params: { redirect: '/product/p1' },
    });
  });

  it('sends a wishlist tap to login instead of calling wishlist-service', async () => {
    const rendered = renderActions(false);

    await act(async () => {
      await rendered.api.toggleWishlist(PRODUCT);
    });

    expect(mockWishlistApi.addItem).not.toHaveBeenCalled();
    expect(mockWishlistApi.list).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/(auth)/login',
      params: { redirect: '/product/p1' },
    });
  });
});

describe('useProductActions when signed in', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sends the denormalised snapshot cart-service requires', async () => {
    mockCartApi.addItem.mockResolvedValue({
      userId: 'u1',
      items: [],
      couponDiscount: 0,
      subtotal: 30000,
      itemCount: 2,
      updatedAt: '',
      expiresAt: '',
    });
    const rendered = renderActions(true);

    let result: boolean | undefined;
    await act(async () => {
      result = await rendered.api.addToCart(PRODUCT, 2);
    });

    expect(result).toBe(true);
    expect(router.push).not.toHaveBeenCalled();
    // A partial body is a 400 from cart-service — it stores a snapshot, not a
    // productId reference.
    expect(mockCartApi.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: 'p1',
        sellerId: 's1',
        productName: 'Kampala Coffee',
        productImage: 'https://cdn.example/coffee.jpg',
        price: 15000,
        quantity: 2,
        maxQuantity: 7,
      }),
    );
  });

  it('creates the default wishlist first when the account has none', async () => {
    // A fresh account has no list, so the first save has nowhere to write until
    // fetchWishlistsThunk creates one.
    mockWishlistApi.list.mockResolvedValue([]);
    mockWishlistApi.create.mockResolvedValue({
      id: 'w1',
      userId: 'u1',
      name: 'My Wishlist',
      isPublic: false,
      items: [],
      createdAt: '',
      updatedAt: '',
    });
    mockWishlistApi.addItem.mockResolvedValue({
      id: 'w1',
      userId: 'u1',
      name: 'My Wishlist',
      isPublic: false,
      items: [],
      createdAt: '',
      updatedAt: '',
    });
    const rendered = renderActions(true);

    await act(async () => {
      await rendered.api.toggleWishlist(PRODUCT);
    });

    expect(mockWishlistApi.create).toHaveBeenCalled();
    expect(mockWishlistApi.addItem).toHaveBeenCalledWith(
      'w1',
      expect.objectContaining({ productId: 'p1', productName: 'Kampala Coffee', price: 15000 }),
    );
  });
});
