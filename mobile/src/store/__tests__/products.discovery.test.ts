/**
 * Catalogue state for the marketplace screens.
 *
 * Home, Search and the category screens used to fetch into local component
 * state (and Search into a hardcoded mock array), so there was nothing to test
 * and nothing shared. These thunks are now the single path to product data, and
 * paging in particular is easy to get wrong: search-service pages from 1 while
 * GET /products pages from 0.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), push: jest.fn() } }));

jest.mock('@/api/products.api', () => ({
  productsApi: {
    searchProducts: jest.fn(),
    getCategories: jest.fn(),
    getProductById: jest.fn(),
    getRelatedProducts: jest.fn(),
    getProducts: jest.fn(),
  },
}));

import { configureStore } from '@reduxjs/toolkit';
import { productsApi } from '@/api/products.api';
import productsReducer, {
  clearSearchResults,
  fetchProductByIdThunk,
  searchProductsThunk,
} from '../products.slice';
import type { Product } from '@/types';

const mockApi = productsApi as jest.Mocked<typeof productsApi>;

function product(id: string): Product {
  return {
    id,
    name: `Product ${id}`,
    description: '',
    price: 1000,
    currency: 'UGX',
    imageUrls: [],
    category: { id: 'c1', name: 'Food', slug: 'food' },
    categoryId: 'c1',
    sellerId: 's1',
    averageRating: 4,
    reviewCount: 2,
    stockQuantity: 5,
    inStock: true,
    tags: [],
    createdAt: new Date().toISOString(),
  };
}

function makeStore() {
  return configureStore({ reducer: { products: productsReducer } });
}

describe('searchProductsThunk', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sends the query and filters through to the API', async () => {
    mockApi.searchProducts.mockResolvedValue({ products: [product('1')], total: 1, page: 1, pages: 1 });
    const store = makeStore();

    await store.dispatch(
      searchProductsThunk({ query: 'coffee', filters: { category: 'food', sortBy: 'rating' } }),
    );

    expect(mockApi.searchProducts).toHaveBeenCalledWith('coffee', {
      category: 'food',
      sortBy: 'rating',
      page: 1,
    });
    expect(store.getState().products.searchResults).toHaveLength(1);
    expect(store.getState().products.searchTotal).toBe(1);
  });

  it('appends the next page instead of replacing the list', async () => {
    mockApi.searchProducts.mockResolvedValueOnce({
      products: [product('1'), product('2')],
      total: 4,
      page: 1,
      pages: 2,
    });
    const store = makeStore();
    await store.dispatch(searchProductsThunk({ query: 'x' }));
    expect(store.getState().products.pagination.hasMore).toBe(true);

    mockApi.searchProducts.mockResolvedValueOnce({
      products: [product('3'), product('4')],
      total: 4,
      page: 2,
      pages: 2,
    });
    await store.dispatch(searchProductsThunk({ query: 'x', page: 2, append: true }));

    expect(store.getState().products.searchResults.map((p) => p.id)).toEqual(['1', '2', '3', '4']);
    // Last page reached, so the list must stop asking for more.
    expect(store.getState().products.pagination.hasMore).toBe(false);
  });

  it('surfaces a failure as a message rather than throwing', async () => {
    mockApi.searchProducts.mockRejectedValue(new Error('Search index is down'));
    const store = makeStore();

    await store.dispatch(searchProductsThunk({ query: 'x' }));

    expect(store.getState().products.searchError).toBe('Search index is down');
    expect(store.getState().products.searchLoading).toBe(false);
  });

  it('clearSearchResults empties the shared result list', async () => {
    mockApi.searchProducts.mockResolvedValue({ products: [product('1')], total: 1, page: 1, pages: 1 });
    const store = makeStore();
    await store.dispatch(searchProductsThunk({ query: 'x' }));

    store.dispatch(clearSearchResults());

    expect(store.getState().products.searchResults).toEqual([]);
    expect(store.getState().products.pagination.hasMore).toBe(false);
  });
});

describe('fetchProductByIdThunk', () => {
  beforeEach(() => jest.clearAllMocks());

  it('stores the real product for the detail screen', async () => {
    mockApi.getProductById.mockResolvedValue(product('42'));
    const store = makeStore();

    await store.dispatch(fetchProductByIdThunk('42'));

    expect(mockApi.getProductById).toHaveBeenCalledWith('42');
    expect(store.getState().products.currentProduct?.id).toBe('42');
    expect(store.getState().products.productError).toBeNull();
  });

  it('reports a load failure without leaving the screen spinning', async () => {
    mockApi.getProductById.mockRejectedValue(new Error('Product not found'));
    const store = makeStore();

    await store.dispatch(fetchProductByIdThunk('nope'));

    expect(store.getState().products.productLoading).toBe(false);
    expect(store.getState().products.productError).toBe('Product not found');
  });
});
