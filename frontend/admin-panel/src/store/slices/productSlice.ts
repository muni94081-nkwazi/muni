import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { productsApi } from '@/api/products.api';
import type { Product, ProductStatus, ModerationCounts } from '@/types/product.types';

interface ProductState {
  products: Product[];
  counts:   ModerationCounts;
  total:    number;
  lastPage: number;
  loading:  boolean;
  error:    string | null;
  /** Id currently being approved/rejected — disables just that row's buttons. */
  moderatingId: string | null;
}

const initialState: ProductState = {
  products: [],
  counts:   {},
  total:    0,
  lastPage: 0,
  loading:  false,
  error:    null,
  moderatingId: null,
};

export const fetchProductsThunk = createAsyncThunk(
  'product/fetchProducts',
  async (
    { page, status, q }: { page?: number; status?: ProductStatus; q?: string },
    { rejectWithValue },
  ) => {
    try {
      return await productsApi.list(page ?? 1, 20, status ?? 'PENDING_APPROVAL', q);
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.message ?? err.message ?? 'Failed to load products');
    }
  },
);

export const fetchModerationCountsThunk = createAsyncThunk(
  'product/fetchCounts',
  async (_, { rejectWithValue }) => {
    try {
      return await productsApi.counts();
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.message ?? err.message ?? 'Failed to load counts');
    }
  },
);

export const approveProductThunk = createAsyncThunk(
  'product/approve',
  async (id: string, { rejectWithValue }) => {
    try {
      return await productsApi.approve(id);
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.message ?? err.message ?? 'Approval failed');
    }
  },
);

export const rejectProductThunk = createAsyncThunk(
  'product/reject',
  async ({ id, reason }: { id: string; reason: string }, { rejectWithValue }) => {
    try {
      return await productsApi.reject(id, reason);
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.message ?? err.message ?? 'Rejection failed');
    }
  },
);

const productSlice = createSlice({
  name: 'product',
  initialState,
  reducers: {
    clearProductError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchProductsThunk.pending, (state) => {
        state.loading = true;
        state.error   = null;
      })
      .addCase(fetchProductsThunk.fulfilled, (state, action) => {
        state.loading  = false;
        state.products = action.payload.data;
        state.total    = action.payload.meta.total;
        state.lastPage = action.payload.meta.last_page;
      })
      .addCase(fetchProductsThunk.rejected, (state, action) => {
        state.loading = false;
        state.error   = (action.payload as string) ?? action.error.message ?? null;
      })
      .addCase(fetchModerationCountsThunk.fulfilled, (state, action) => {
        state.counts = action.payload;
      });

    // Approve and reject behave identically from the list's point of view: the
    // product leaves the status the admin is currently filtering on, so it is
    // removed from the visible queue rather than left behind with a stale badge.
    for (const thunk of [approveProductThunk, rejectProductThunk]) {
      builder
        .addCase(thunk.pending, (state, action) => {
          const arg = action.meta.arg;
          state.moderatingId = typeof arg === 'string' ? arg : arg.id;
          state.error = null;
        })
        .addCase(thunk.fulfilled, (state, action) => {
          state.moderatingId = null;
          state.products = state.products.filter((p) => p.id !== action.payload.id);
          state.total = Math.max(0, state.total - 1);
        })
        .addCase(thunk.rejected, (state, action) => {
          state.moderatingId = null;
          state.error = (action.payload as string) ?? action.error.message ?? null;
        });
    }
  },
});

export const { clearProductError } = productSlice.actions;
export default productSlice.reducer;
