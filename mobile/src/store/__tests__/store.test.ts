/**
 * Regression guard for the store composition.
 *
 * src/store/index.ts previously declared two cut-down slices inline and never
 * imported the four real ones, so `state.products` and `state.ui` did not exist
 * and `state.auth.user` could never be set. Every assertion here fails against
 * that version.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), push: jest.fn() } }));

import { store } from '../index';
import { setTokens, setUser, clearAuth } from '../auth.slice';
import { setCart } from '../cart.slice';
import { setFeatured } from '../products.slice';
import { setCurrency } from '../ui.slice';
import { fetchCartThunk } from '../cart.slice';

describe('store composition', () => {
  it('registers every real reducer', () => {
    expect(Object.keys(store.getState()).sort()).toEqual([
      'auth',
      'cart',
      'checkout',
      'products',
      'ui',
      'wishlist',
    ]);
  });

  it('exposes the full auth shape (not the old inline slice)', () => {
    expect(store.getState().auth).toEqual({
      accessToken: null,
      refreshToken: null,
      user: null,
      isLoading: false,
      // Starts false so guards can tell "restoring" from "signed out". The
      // thunk flips it on both its success and failure paths; if it were ever
      // to start true, a logged-in user would be treated as signed out for the
      // first frames of every launch.
      hasBootstrapped: false,
      error: null,
    });
  });

  it('state.ui exists and is readable (useFormatPrice used to throw here)', () => {
    expect(store.getState().ui.currency).toBe('USD');
    store.dispatch(setCurrency('UGX'));
    expect(store.getState().ui.currency).toBe('UGX');
  });

  it('state.products exists', () => {
    expect(store.getState().products.featured).toEqual([]);
    store.dispatch(setFeatured([]));
  });

  it('setUser populates the user the seller role gate reads', () => {
    store.dispatch(
      setUser({
        id: 'u1',
        firstName: 'A',
        lastName: 'B',
        email: 'a@b.c',
        phoneNumber: null,
        profilePictureUrl: null,
        roles: ['ROLE_SELLER'],
        emailVerified: true,
        createdAt: '2026-01-01',
      })
    );
    expect(store.getState().auth.user?.roles).toContain('ROLE_SELLER');
  });

  it('cart has real reducers', () => {
    store.dispatch(
      setCart({
        userId: 'user-1',
        items: [],
        couponDiscount: 0,
        subtotal: 0,
        itemCount: 0,
        updatedAt: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
      })
    );
    expect(store.getState().cart).toMatchObject({ items: [], subtotal: 0, itemCount: 0 });
  });

  it('fetchCartThunk is a real thunk action creator', () => {
    expect(typeof fetchCartThunk).toBe('function');
    expect(typeof fetchCartThunk.pending.type).toBe('string');
  });

  it('clearAuth resets the session', () => {
    store.dispatch(setTokens({ accessToken: 'a', refreshToken: 'r' }));
    expect(store.getState().auth.accessToken).toBe('a');
    store.dispatch(clearAuth());
    expect(store.getState().auth.accessToken).toBeNull();
    expect(store.getState().auth.user).toBeNull();
  });
});
