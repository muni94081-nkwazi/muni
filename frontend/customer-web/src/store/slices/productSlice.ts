import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { productsApi, type ListProductsQuery } from '@/api/products.api';
import type { Category, Product, ProductFilters } from '@/types/product.types';
import type { PaginatedMeta } from '@/types/api.types';
import { errorMessage } from '@/utils/helpers'

const SERVER_SORTS = ['relevance', 'price_asc', 'price_desc', 'newest', 'rating'] as const;

function normalizeSort(value: string | undefined): ListProductsQuery['sort'] {
  return SERVER_SORTS.includes(value as (typeof SERVER_SORTS)[number])
    ? (value as ListProductsQuery['sort'])
    : undefined;
}

interface ProductState {
  items: Product[];
  meta: PaginatedMeta | null;
  categories: Category[];
  selectedProduct: Product | null;
  filters: ProductFilters;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: ProductState = {
  items: [],
  meta: null,
  categories: [],
  selectedProduct: null,
  filters: {},
  status: 'idle',
  error: null,
};

export const fetchProducts = createAsyncThunk(
  'products/fetchProducts',
  async (filters: ProductFilters | undefined, { rejectWithValue, signal }) => {
    try {
      // `signal` comes from createAsyncThunk and fires when the caller invokes
      // .abort() on the returned promise. Threading it into axios means a
      // superseded search is cancelled on the wire instead of finishing and
      // racing the current one: typing "sam" then "samsung" used to leave two
      // requests in flight, and whichever the network returned LAST won — so a
      // congested link regularly showed results for "sam" while the box read
      // "samsung".
      if (filters?.query || filters?.minPrice || filters?.maxPrice || filters?.tags?.length) {
        return await productsApi.search(filters, { signal });
      }
      return await productsApi.list(
        {
          page:      filters?.page ?? 0,
          limit:     filters?.limit ?? 20,
          category:  typeof filters?.category === 'string' ? filters.category : filters?.categoryId,
          sort:      normalizeSort(filters?.sortBy ?? filters?.sort),
          inStock:   filters?.inStock,
          minRating: filters?.minRating,
        },
        { signal },
      );
    } catch (error) {
      return rejectWithValue(errorMessage(error, 'Could not load products'));
    }
  },
);

export const fetchProductBySlug = createAsyncThunk(
  'products/fetchProductBySlug',
  async (slug: string, { rejectWithValue }) => {
    try {
      return await productsApi.getBySlug(slug);
    } catch (error) {
      return rejectWithValue(errorMessage(error, 'Could not load this product'));
    }
  },
);

export const fetchCategories = createAsyncThunk('products/fetchCategories', async (_, { rejectWithValue }) => {
  try {
    return await productsApi.getCategoryTree();
  } catch (error) {
    return rejectWithValue(errorMessage(error, 'Could not load categories'));
  }
});

const productSlice = createSlice({
  name: 'products',
  initialState,
  reducers: {
    setFilters(state, action) {
      state.filters = { ...state.filters, ...action.payload };
    },
    clearSelectedProduct(state) {
      state.selectedProduct = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchProducts.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchProducts.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.items = action.payload.data;
        state.meta = action.payload.meta;
      })
      .addCase(fetchProducts.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.status = 'failed';
        state.error = action.payload as string;
      })
      .addCase(fetchProductBySlug.pending, (state) => {
        state.status = 'loading';
        state.selectedProduct = null;
      })
      .addCase(fetchProductBySlug.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.selectedProduct = action.payload;
      })
      .addCase(fetchProductBySlug.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      })
      .addCase(fetchCategories.fulfilled, (state, action) => {
        state.categories = action.payload;
      });
  },
});

export const { setFilters, clearSelectedProduct } = productSlice.actions;
export default productSlice.reducer;
