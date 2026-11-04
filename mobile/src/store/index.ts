import { configureStore } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onSessionExpired } from '@/api/authEvents';
import { STORAGE_KEYS } from '@/constants';
import { logger } from '@/utils/logger';
import authReducer, { clearAuth } from './auth.slice';
import cartReducer, { clearCart } from './cart.slice';
import checkoutReducer, { resetCheckout } from './checkout.slice';
import productsReducer from './products.slice';
import uiReducer, { hydrateUi, type ThemePreference, type UiState } from './ui.slice';
import wishlistReducer, { clearWishlist } from './wishlist.slice';

/**
 * The app store.
 *
 * This file previously declared two throwaway slices inline — a cut-down `auth`
 * with no `setUser`, and a `cart` with only `setItems` — and never imported the
 * four real slice files sitting beside it. The consequences were invisible at
 * build time and fatal at runtime: `state.products` and `state.ui` did not
 * exist at all (so `useFormatPrice()` threw on `s.ui.currency`), and
 * `state.auth.user` could never be populated, which is why every role check in
 * the app failed closed.
 */
export const store = configureStore({
  reducer: {
    auth: authReducer,
    cart: cartReducer,
    checkout: checkoutReducer,
    products: productsReducer,
    ui: uiReducer,
    wishlist: wishlistReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// ── API layer → Redux ─────────────────────────────────────────────────────────
// The Axios response interceptor cannot import this module (it would close an
// import cycle), so it raises an event instead. Registering here keeps session
// expiry in one place: SecureStore is wiped by the interceptor, Redux is reset
// by this handler, and the interceptor's own endSession() navigates to login
// once the navigator is mounted. The protected screens then render their
// sign-in prompt rather than stale signed-in content.
onSessionExpired(() => {
  store.dispatch(clearAuth());
  store.dispatch(clearCart());
  store.dispatch(clearWishlist());
  store.dispatch(resetCheckout());
});

// ── UI preference persistence ─────────────────────────────────────────────────

const PERSISTED_UI_KEYS = {
  currency: STORAGE_KEYS.CURRENCY,
  language: STORAGE_KEYS.LANGUAGE,
  theme: STORAGE_KEYS.THEME,
  isLowDataMode: STORAGE_KEYS.LOW_DATA_MODE,
} as const;

/**
 * Mirrors the persisted slice of `ui` into AsyncStorage whenever it changes.
 * Replaces the `AsyncStorage.setItem` calls that used to sit inside the ui
 * reducers, which made them impure.
 */
export function subscribeUiPersistence(): () => void {
  let previous = store.getState().ui;

  return store.subscribe(() => {
    const next = store.getState().ui;
    if (next === previous) return;

    for (const [field, key] of Object.entries(PERSISTED_UI_KEYS) as [
      keyof typeof PERSISTED_UI_KEYS,
      string,
    ][]) {
      if (next[field] !== previous[field]) {
        AsyncStorage.setItem(key, String(next[field])).catch((err) => {
          logger.warn(`[store] Failed to persist ui.${field}:`, err);
        });
      }
    }
    previous = next;
  });
}

/** Reads persisted UI preferences back into the store. Safe to call once, at startup. */
export async function hydrateUiPreferences(): Promise<void> {
  try {
    const [currency, language, theme, lowData] = await AsyncStorage.multiGet([
      STORAGE_KEYS.CURRENCY,
      STORAGE_KEYS.LANGUAGE,
      STORAGE_KEYS.THEME,
      STORAGE_KEYS.LOW_DATA_MODE,
    ]).then((entries) => entries.map(([, value]) => value));

    const patch: Partial<UiState> = {};
    if (currency) patch.currency = currency;
    if (language) patch.language = language;
    if (theme === 'light' || theme === 'dark' || theme === 'system') {
      patch.theme = theme as ThemePreference;
    }
    if (lowData !== null) patch.isLowDataMode = lowData === 'true';

    if (Object.keys(patch).length > 0) store.dispatch(hydrateUi(patch));
  } catch (err) {
    logger.warn('[store] Failed to hydrate UI preferences:', err);
  }
}

// Re-exported so screens can keep importing auth actions from '@/store'.
export { clearAuth, setTokens, setUser, logoutThunk } from './auth.slice';
