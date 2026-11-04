import { useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks/useAppSelector';
import {
  fetchProductsThunk,
  fetchModerationCountsThunk,
  approveProductThunk,
  rejectProductThunk,
  clearProductError,
} from '@/store/slices/productSlice';
import type { ProductStatus } from '@/types/product.types';

interface QueueArgs {
  page?:   number;
  status?: ProductStatus;
  q?:      string;
}

export function useProducts() {
  const dispatch = useAppDispatch();
  const { products, counts, total, lastPage, loading, error, moderatingId } =
    useAppSelector((s) => s.products);

  // The fetch is no longer fired from inside this hook. It used to run in a
  // useEffect here with a fixed `{}` argument, which meant the queue always
  // reloaded page 1 of PENDING_APPROVAL and could not follow the status filter
  // or pagination the page owns. The caller drives it instead.
  const fetchProducts = useCallback(
    (args: QueueArgs = {}) => dispatch(fetchProductsThunk(args)),
    [dispatch],
  );

  const fetchCounts = useCallback(
    () => dispatch(fetchModerationCountsThunk()),
    [dispatch],
  );

  const approve = useCallback(
    (id: string) => dispatch(approveProductThunk(id)).unwrap(),
    [dispatch],
  );

  const reject = useCallback(
    (id: string, reason: string) => dispatch(rejectProductThunk({ id, reason })).unwrap(),
    [dispatch],
  );

  return {
    products,
    counts,
    total,
    lastPage,
    isLoading: loading,
    error,
    moderatingId,
    fetchProducts,
    fetchCounts,
    approve,
    reject,
    clearError: () => dispatch(clearProductError()),
  };
}
