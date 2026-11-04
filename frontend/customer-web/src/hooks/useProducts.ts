import { useCallback, useEffect, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks/useAppSelector';
import { fetchCategories, fetchProductBySlug, fetchProducts, setFilters } from '@/store/slices/productSlice';
import type { ProductFilters } from '@/types/product.types';

/** What `dispatch(thunk())` returns — a promise that can cancel its request. */
type AbortablePromise = { abort: (reason?: string) => void };

export function useProducts(initialFilters?: ProductFilters) {
  const dispatch = useAppDispatch();
  const { items, meta, filters, status, error } = useAppSelector((state) => state.products);

  /**
   * The request currently on the wire. Held so the next search can cancel it:
   * debouncing alone only reduces how *many* requests are sent, it does nothing
   * about the two that are already in flight resolving out of order.
   */
  const inFlight = useRef<AbortablePromise | null>(null);

  const run = useCallback(
    (next: ProductFilters | undefined) => {
      inFlight.current?.abort('superseded by a newer query');
      const promise = dispatch(fetchProducts(next));
      inFlight.current = promise;
      return promise;
    },
    [dispatch],
  );

  useEffect(() => {
    run(initialFilters ?? filters);
    // Intentionally only re-runs when initialFilters identity changes
    // (callers pass a new object when filters change); avoids refetching
    // on every render from an inline object literal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, JSON.stringify(initialFilters)]);

  // Cancel whatever is outstanding when the page unmounts, so a slow search
  // can't resolve into an unmounted tree (or land on the next page's results).
  useEffect(() => () => inFlight.current?.abort('component unmounted'), []);

  const updateFilters = useCallback(
    (next: Partial<ProductFilters>) => {
      dispatch(setFilters(next));
      run({ ...filters, ...next });
    },
    [dispatch, run, filters],
  );

  return {
    products: items,
    meta,
    filters,
    isLoading: status === 'loading',
    error,
    updateFilters,
  };
}

export function useProductDetail(slug: string | undefined) {
  const dispatch = useAppDispatch();
  const { selectedProduct, status, error } = useAppSelector((state) => state.products);

  useEffect(() => {
    if (slug) {
      dispatch(fetchProductBySlug(slug));
    }
  }, [dispatch, slug]);

  return {
    product: selectedProduct,
    isLoading: status === 'loading',
    error,
  };
}

export function useCategories() {
  const dispatch = useAppDispatch();
  const { categories } = useAppSelector((state) => state.products);

  useEffect(() => {
    if (categories.length === 0) {
      dispatch(fetchCategories());
    }
  }, [dispatch, categories.length]);

  return { categories };
}
