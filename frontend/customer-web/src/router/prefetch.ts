/**
 * Route chunk prefetching.
 *
 * Code-splitting trades bundle size for a network round-trip at navigation
 * time. On a Ugandan 3G link that round-trip is 300-800 ms of blank space
 * between tapping a product card and seeing the PDP — which is worse than the
 * bundle bloat we removed. Prefetching on *intent* (hover on desktop,
 * touchstart on mobile) hides it: the chunk is usually already in memory by
 * the time the click event fires.
 *
 * `import()` memoizes per specifier, so calling these repeatedly is free —
 * the second call returns the already-settled promise without a new request.
 */
import { logger } from '@/utils/logger';

/** Swallows prefetch failures — a missed prefetch must never surface to the user. */
function warm(loader: () => Promise<unknown>): void {
  void loader().catch((error) => {
    logger.debug('[prefetch] chunk warm-up failed (will load on navigate):', error);
  });
}

export function prefetchProductDetail(): void {
  warm(() => import('@/pages/ProductDetailPage'));
}

export function prefetchCart(): void {
  warm(() => import('@/pages/CartPage'));
}

export function prefetchCheckout(): void {
  warm(() => import('@/pages/CheckoutPage'));
}

/**
 * Handler pair to spread onto a <Link>. `onTouchStart` matters more than
 * `onMouseEnter` here: on mobile there's no hover, and touchstart fires
 * ~80-150 ms before the click, which is often enough to cover the fetch.
 */
export function prefetchHandlers(prefetch: () => void) {
  return { onMouseEnter: prefetch, onTouchStart: prefetch } as const;
}
