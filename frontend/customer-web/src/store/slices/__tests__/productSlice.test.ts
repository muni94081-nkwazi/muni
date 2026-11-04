import { describe, expect, it, vi, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import type { PaginatedResponse } from '@/types/api.types';
import type { Product } from '@/types/product.types';

vi.mock('@/api/products.api', () => ({
  productsApi: {
    list: vi.fn(),
    search: vi.fn(),
    getBySlug: vi.fn(),
    getCategoryTree: vi.fn(),
  },
}));

import { productsApi } from '@/api/products.api';
import productReducer, { fetchProducts } from '../productSlice';

function page(names: string[]): PaginatedResponse<Product> {
  return {
    data: names.map((name, i) => ({ id: `p-${i}`, name })) as unknown as Product[],
    meta: { current_page: 0, last_page: 1, total: names.length },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('search cancellation', () => {
  it('passes the thunk AbortSignal down to the API layer', async () => {
    const store = configureStore({ reducer: { products: productReducer } });
    vi.mocked(productsApi.search).mockResolvedValueOnce(page(['Samsung A15']));

    await store.dispatch(fetchProducts({ query: 'samsung' }));

    expect(productsApi.search).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'samsung' }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('aborts the in-flight request instead of letting it race the newer one', async () => {
    const store = configureStore({ reducer: { products: productReducer } });

    // "sam" — slow, never resolves on its own.
    let sawAbort = false;
    vi.mocked(productsApi.search).mockImplementationOnce((_filters, options) => {
      return new Promise((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => {
          sawAbort = true;
          reject(new DOMException('canceled', 'AbortError'));
        });
      });
    });

    const stale = store.dispatch(fetchProducts({ query: 'sam' }));

    // "samsung" — the keystroke that supersedes it.
    vi.mocked(productsApi.search).mockResolvedValueOnce(page(['Samsung A15']));

    stale.abort('superseded');
    await stale;
    await store.dispatch(fetchProducts({ query: 'samsung' }));

    expect(sawAbort).toBe(true);
    expect(store.getState().products.items.map((p) => p.name)).toEqual(['Samsung A15']);
  });

  it('does not surface an error banner when a request is aborted', async () => {
    const store = configureStore({ reducer: { products: productReducer } });
    vi.mocked(productsApi.search).mockImplementationOnce((_filters, options) => {
      return new Promise((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () =>
          reject(new DOMException('canceled', 'AbortError')),
        );
      });
    });

    const stale = store.dispatch(fetchProducts({ query: 'sam' }));
    stale.abort('superseded');
    await stale;

    // A superseded keystroke is not a failure the shopper should ever see.
    expect(store.getState().products.status).not.toBe('failed');
    expect(store.getState().products.error).toBeNull();
  });
});
