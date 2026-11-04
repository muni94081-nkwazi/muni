import { router } from 'expo-router';

/**
 * Sends a signed-out user to login and remembers where they were going.
 *
 * Mobile has no guest cart (see the note in store/cart.slice.ts), so every
 * cart, wishlist, checkout and account action needs a session first. Dropping
 * the user on Home after they sign in loses the thing they were trying to do,
 * so the intended destination rides along as `redirect` and the auth screens
 * replace to it on success.
 */
export function promptSignIn(redirectTo: string): void {
  router.push({ pathname: '/(auth)/login', params: { redirect: redirectTo } });
}

/** Where the tabs land by default when there is nothing to return to. */
export const DEFAULT_AUTH_DESTINATION = '/(tabs)';

/**
 * Normalises the `redirect` route param.
 *
 * Expo Router hands a param back as `string | string[]`, and only in-app paths
 * are ever accepted — anything that is not a leading-slash path is dropped so a
 * crafted deep link cannot use the auth screens to bounce a signed-in user
 * somewhere else.
 */
export function resolveRedirect(param: string | string[] | undefined): string {
  const value = Array.isArray(param) ? param[0] : param;
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return DEFAULT_AUTH_DESTINATION;
  }
  return value;
}
