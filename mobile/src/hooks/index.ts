/**
 * MUNI Mobile — Custom React hooks
 */
import { useCallback, useEffect, useRef } from 'react';
import { useTranslation as useI18nTranslation } from 'react-i18next';
import { Animated, Easing } from 'react-native';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { fetchCartThunk } from '@/store/cart.slice';
import { loadStoredAuthThunk } from '@/store/auth.slice';

// ── i18n ──────────────────────────────────────────────────────────────────────

/** Typed wrapper around react-i18next useTranslation */
export function useTranslation() {
  return useI18nTranslation();
}

// ── Auth ──────────────────────────────────────────────────────────────────────

/** Returns current auth state + whether the user is authenticated */
export function useAuth() {
  const { accessToken, user, isLoading, error } = useAppSelector((s) => s.auth);
  return {
    isAuthenticated: !!accessToken,
    user,
    isLoading,
    error,
    accessToken,
  };
}

/** Load stored auth tokens from SecureStore on app startup */
export function useAuthInit() {
  const dispatch = useAppDispatch();
  useEffect(() => {
    dispatch(loadStoredAuthThunk());
  }, [dispatch]);
}

// ── Cart ──────────────────────────────────────────────────────────────────────

/** Returns cart state and item count */
export function useCart() {
  const { items, isLoading, error, subtotal, itemCount, couponCode, couponDiscount, couponMessage } =
    useAppSelector((s) => s.cart);
  return { items, isLoading, error, subtotal, itemCount, couponCode, couponDiscount, couponMessage };
}

/** Fetch cart on mount (when authenticated) */
export function useCartSync() {
  const dispatch = useAppDispatch();
  const { isAuthenticated } = useAuth();
  useEffect(() => {
    if (isAuthenticated) {
      dispatch(fetchCartThunk());
    }
  }, [isAuthenticated, dispatch]);
}

// ── Animations ────────────────────────────────────────────────────────────────

/** Simple fade-in animation that runs once on mount */
export function useFadeIn(duration = 400) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue:         1,
      duration,
      easing:          Easing.ease,
      useNativeDriver: true,
    }).start();
  }, [opacity, duration]);

  return opacity;
}

/** Pulse animation (scale up/down loop) — useful for sale badges */
export function usePulse(minScale = 0.95, maxScale = 1.05, speed = 800) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: maxScale, duration: speed, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(scale, { toValue: minScale, duration: speed, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])
    ).start();

    return () => scale.stopAnimation();
  }, [scale, minScale, maxScale, speed]);

  return scale;
}

// ── Debounce ──────────────────────────────────────────────────────────────────

/** Returns a debounced version of the provided callback */
export function useDebounce<T extends (...args: unknown[]) => void>(fn: T, delay: number): T {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  return useCallback(
    ((...args: Parameters<T>) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => fn(...args), delay);
    }) as T,
    [fn, delay]
  );
}

// ── Format helpers ────────────────────────────────────────────────────────────

/** Format a price with currency symbol */
export function useFormatPrice() {
  const currency = useAppSelector((s) => s.ui.currency);

  return useCallback(
    (amount: number, overrideCurrency?: string): string => {
      const curr = overrideCurrency ?? currency ?? 'USD';
      try {
        return new Intl.NumberFormat('en-US', {
          style:                 'currency',
          currency:              curr,
          minimumFractionDigits: 0,
          maximumFractionDigits: 2,
        }).format(amount);
      } catch {
        return `${curr} ${amount.toFixed(2)}`;
      }
    },
    [currency]
  );
}

/** Format a date string for display */
export function formatDate(isoString: string, locale = 'en-US'): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      year:  'numeric',
      month: 'short',
      day:   'numeric',
    }).format(new Date(isoString));
  } catch {
    return isoString;
  }
}
