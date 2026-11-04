import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import { productsApi, type ProductListParams, type ProductSearchFilters } from '@/api/products.api';
import type { Category, Product } from '@/types';
import type { RootState } from './index';

export interface ProductsPagination {
  page: number;
  total: number;
  hasMore: boolean;
}

export interface ProductsState {
  featured: Product[];
  searchQuery: string;
  searchResults: Product[];
  searchTotal: number;
  /** Spelling correction from search-service, shown when a query barely matched. */
  didYouMean: string | null;
  currentProduct: Product | null;
  relatedProducts: Product[];
  categories: Category[];
  isLoading: boolean;
  searchLoading: boolean;
  productLoading: boolean;
  categoriesLoading: boolean;
  error: string | null;
  searchError: string | null;
  productError: string | null;
  pagination: ProductsPagination;
}

const initialState: ProductsState = {
  featured: [],
  searchQuery: '',
  searchResults: [],
  searchTotal: 0,
  didYouMean: null,
  currentProduct: null,
  relatedProducts: [],
  categories: [],
  isLoading: false,
  searchLoading: false,
  productLoading: false,
  categoriesLoading: false,
  error: null,
  searchError: null,
  productError: null,
  pagination: { page: 0, total: 0, hasMore: false },
};

function message(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

const CATEGORY_TTL_MS = 5 * 60 * 1000;
let categoriesFetchedAt = 0;

/** Categories change rarely; skip the network round-trip if we fetched recently. */
export const fetchCategoriesThunk = createAsyncThunk<Category[], void, { state: RootState; rejectValue: string }>(
  'products/fetchCategories',
  async (_arg, { getState, rejectWithValue }) => {
    const cached = getState().products.categories;
    if (cached.length > 0 && Date.now() - categoriesFetchedAt < CATEGORY_TTL_MS) {
      return cached;
    }
    try {
      const categories = await productsApi.getCategories();
      categoriesFetchedAt = Date.now();
      return categories;
    } catch (err) {
      return rejectWithValue(message(err, 'Could not load categories'));
    }
  },
);

export const fetchProductByIdThunk = createAsyncThunk<Product, string, { rejectValue: string }>(
  'products/fetchById',
  async (id, { rejectWithValue }) => {
    try {
      return await productsApi.getProductById(id);
    } catch (err) {
      return rejectWithValue(message(err, 'Could not load this product'));
    }
  },
);

export const fetchRelatedProductsThunk = createAsyncThunk<Product[], string, { rejectValue: string }>(
  'products/fetchRelated',
  async (productId, { rejectWithValue }) => {
    try {
      return await productsApi.getRelatedProducts(productId);
    } catch {
      // Related products are a nice-to-have on the PDP — a failure here should
      // never surface as a page-level error, just an empty rail.
      return rejectWithValue('');
    }
  },
);

export interface SearchProductsArg {
  query: string;
  filters?: ProductSearchFilters;
  /** True when paginating an existing result set rather than starting a new search. */
  append?: boolean;
  page?: number;
}

export const searchProductsThunk = createAsyncThunk<
  { products: Product[]; total: number; append: boolean; page: number; pages: number; didYouMean?: string | null },
  SearchProductsArg,
  { rejectValue: string }
>('products/search', async ({ query, filters, append, page }, { rejectWithValue }) => {
  try {
    // search-service pages from 1, unlike GET /products which pages from 0.
    const result = await productsApi.searchProducts(query, { ...filters, page: page ?? 1 });
    return {
      products: result.products,
      total: result.total,
      pages: result.pages,
      didYouMean: result.didYouMean,
      append: !!append,
      page: result.page,
    };
  } catch (err) {
    return rejectWithValue(message(err, 'Search failed'));
  }
});

export const fetchProductsByCategoryThunk = createAsyncThunk<
  { products: Product[]; total: number; append: boolean; page: number },
  { params: ProductListParams; append?: boolean },
  { rejectValue: string }
>('products/fetchByCategory', async ({ params, append }, { rejectWithValue }) => {
  try {
    const result = await productsApi.getProducts(params);
    return { products: result.products, total: result.total, append: !!append, page: params.page ?? 0 };
  } catch (err) {
    return rejectWithValue(message(err, 'Could not load products'));
  }
});

export const productsSlice = createSlice({
  name: 'products',
  initialState,
  reducers: {
    setFeatured(state, action: PayloadAction<Product[]>) {
      state.featured = action.payload;
    },
    setCurrentProduct(state, action: PayloadAction<Product | null>) {
      state.currentProduct = action.payload;
      state.relatedProducts = [];
    },
    setSearchQuery(state, action: PayloadAction<string>) {
      state.searchQuery = action.payload;
    },
    clearSearchResults(state) {
      state.searchResults = [];
      state.searchTotal = 0;
      state.didYouMean = null;
      state.pagination = { page: 0, total: 0, hasMore: false };
      state.searchError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCategoriesThunk.pending, (state) => {
        state.categoriesLoading = true;
      })
      .addCase(fetchCategoriesThunk.fulfilled, (state, action) => {
        state.categoriesLoading = false;
        state.categories = action.payload;
      })
      .addCase(fetchCategoriesThunk.rejected, (state, action) => {
        state.categoriesLoading = false;
        state.error = action.payload ?? 'Could not load categories';
      })
      .addCase(fetchProductByIdThunk.pending, (state) => {
        state.productLoading = true;
        state.productError = null;
      })
      .addCase(fetchProductByIdThunk.fulfilled, (state, action) => {
        state.productLoading = false;
        state.currentProduct = action.payload;
      })
      .addCase(fetchProductByIdThunk.rejected, (state, action) => {
        state.productLoading = false;
        state.productError = action.payload ?? 'Could not load this product';
      })
      .addCase(fetchRelatedProductsThunk.fulfilled, (state, action) => {
        state.relatedProducts = action.payload;
      })
      .addCase(searchProductsThunk.pending, (state) => {
        state.searchLoading = true;
        state.searchError = null;
      })
      .addCase(searchProductsThunk.fulfilled, (state, action) => {
        state.searchLoading = false;
        const { products, total, append, page, pages, didYouMean } = action.payload;
        state.searchResults = append ? [...state.searchResults, ...products] : products;
        state.searchTotal = total;
        state.didYouMean = didYouMean ?? null;
        state.pagination = { page, total, hasMore: page < pages };
      })
      .addCase(searchProductsThunk.rejected, (state, action) => {
        state.searchLoading = false;
        state.searchError = action.payload ?? 'Search failed';
      })
      .addCase(fetchProductsByCategoryThunk.pending, (state) => {
        state.searchLoading = true;
        state.searchError = null;
      })
      .addCase(fetchProductsByCategoryThunk.fulfilled, (state, action) => {
        state.searchLoading = false;
        const { products, total, append, page } = action.payload;
        state.searchResults = append ? [...state.searchResults, ...products] : products;
        state.searchTotal = total;
        state.pagination = { page, total, hasMore: state.searchResults.length < total };
      })
      .addCase(fetchProductsByCategoryThunk.rejected, (state, action) => {
        state.searchLoading = false;
        state.searchError = action.payload ?? 'Could not load products';
      });
  },
});

export const { setFeatured, setCurrentProduct, setSearchQuery, clearSearchResults } = productsSlice.actions;

export const selectCategories = (state: RootState): Category[] => state.products.categories;

export default productsSlice.reducer;
