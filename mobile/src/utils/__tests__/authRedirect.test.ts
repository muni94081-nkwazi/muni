/**
 * The return-to-destination contract behind contextual sign-in.
 *
 * A guest who taps Add to Cart, Checkout or Wishlist is sent to login carrying
 * where they were. If this resolution is wrong they land on Home instead and
 * lose the thing they were doing — which is the behaviour the marketplace
 * rework exists to remove.
 */
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), push: jest.fn() } }));

import { router } from 'expo-router';
import { promptSignIn, resolveRedirect, DEFAULT_AUTH_DESTINATION } from '../authRedirect';

describe('resolveRedirect', () => {
  it('keeps an in-app path', () => {
    expect(resolveRedirect('/checkout')).toBe('/checkout');
    expect(resolveRedirect('/product/abc123')).toBe('/product/abc123');
    expect(resolveRedirect('/(tabs)/cart')).toBe('/(tabs)/cart');
  });

  it('takes the first value when expo-router hands back an array', () => {
    expect(resolveRedirect(['/checkout', '/somewhere-else'])).toBe('/checkout');
  });

  it('falls back to the tabs when there is nothing to return to', () => {
    expect(resolveRedirect(undefined)).toBe(DEFAULT_AUTH_DESTINATION);
    expect(resolveRedirect('')).toBe(DEFAULT_AUTH_DESTINATION);
  });

  it('refuses anything that is not a single-slash in-app path', () => {
    // A crafted deep link must not be able to use the auth screens as an open
    // redirect once a session exists.
    expect(resolveRedirect('https://evil.example.com')).toBe(DEFAULT_AUTH_DESTINATION);
    expect(resolveRedirect('//evil.example.com')).toBe(DEFAULT_AUTH_DESTINATION);
    expect(resolveRedirect('javascript:alert(1)')).toBe(DEFAULT_AUTH_DESTINATION);
  });
});

describe('promptSignIn', () => {
  it('pushes login with the destination attached', () => {
    promptSignIn('/product/xyz');
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/(auth)/login',
      params: { redirect: '/product/xyz' },
    });
  });
});
