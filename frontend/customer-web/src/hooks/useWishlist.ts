import { useCallback, useEffect, useState } from 'react';
import { wishlistApi, resolveDefaultWishlist, type Wishlist } from '@/api/wishlist.api';
import { useAuth } from '@/hooks/useAuth';

// ─── One wishlist lookup for the whole page ───────────────────────────────────
//
// The product card used to hold `isWishlist` in local state initialised to
// `false`. A shopper who had already saved an item saw an empty heart on it
// every time the grid rendered, and clicking it wrote a duplicate.
//
// Hydrating it per card would be worse: `resolveDefaultWishlist()` is a GET
// /wishlists, so a 40-card grid would issue 40 identical requests. Instead the
// lookup is a module-level promise shared by every card on the page — the
// first card to mount starts it, the rest await the same one — and the
// resulting product ids are broadcast to subscribers.

let lookup: Promise<Wishlist> | null = null;
let savedProductIds = new Set<string>();
const subscribers = new Set<(ids: Set<string>) => void>();

function publish(): void {
  // A fresh Set each time, so subscribers see a new reference and re-render.
  const snapshot = new Set(savedProductIds);
  savedProductIds = snapshot;
  subscribers.forEach((notify) => notify(snapshot));
}

/** Drops the cached lookup. Sign-out must not leave one shopper's saves visible to the next. */
export function resetWishlistCache(): void {
  lookup = null;
  savedProductIds = new Set();
  publish();
}

function loadWishlist(): Promise<Wishlist> {
  if (!lookup) {
    lookup = resolveDefaultWishlist()
      .then((wishlist) => {
        savedProductIds = new Set(wishlist.items?.map((item) => item.productId) ?? []);
        publish();
        return wishlist;
      })
      .catch((error) => {
        // Let the next caller retry rather than caching a rejection forever.
        lookup = null;
        throw error;
      });
  }
  return lookup;
}

export interface UseWishlistResult {
  /** Whether this product is already saved. `false` until hydration finishes. */
  isSaved: (productId: string) => boolean;
  /** Saves the product. Resolves false if the shopper is not signed in. */
  save: (item: { productId: string; productName: string; productImage: string; price: number }) => Promise<boolean>;
  isHydrated: boolean;
}

export function useWishlist(): UseWishlistResult {
  const { isAuthenticated } = useAuth();
  const [ids, setIds] = useState<Set<string>>(savedProductIds);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    // Nothing to hydrate for a signed-out visitor, and /wishlists would 401.
    if (!isAuthenticated) {
      setIsHydrated(true);
      return;
    }

    let cancelled = false;
    const notify = (next: Set<string>) => { if (!cancelled) setIds(next); };
    subscribers.add(notify);

    loadWishlist()
      .then(() => { if (!cancelled) setIsHydrated(true); })
      // A failed lookup leaves every heart empty, which is the honest state:
      // we do not know what is saved, so we do not claim anything is.
      .catch(() => { if (!cancelled) setIsHydrated(true); });

    return () => {
      cancelled = true;
      subscribers.delete(notify);
    };
  }, [isAuthenticated]);

  const isSaved = useCallback((productId: string) => ids.has(productId), [ids]);

  const save = useCallback<UseWishlistResult['save']>(async (item) => {
    if (!isAuthenticated) return false;

    const wishlist = await loadWishlist();
    await wishlistApi.addItem(wishlist.id, {
      productId: item.productId,
      productName: item.productName,
      productImage: item.productImage,
      price: item.price,
    });

    savedProductIds.add(item.productId);
    publish();
    return true;
  }, [isAuthenticated]);

  return { isSaved, save, isHydrated };
}
