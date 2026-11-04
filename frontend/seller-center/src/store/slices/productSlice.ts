import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { productsApi, type ProductFormValues } from '../../api/products.api';
import { Product } from '../../types/product.types';

interface ListArgs {
  page?:   number;
  status?: string;
  q?:      string;
}

// No vendorId argument: the seller is identified by the JWT the gateway
// verifies, not by anything this client sends.
export const fetchProducts = createAsyncThunk(
  'product/fetchProducts',
  async (args: ListArgs | undefined, { rejectWithValue }) => {
    try {
      return await productsApi.list(args?.page ?? 1, 20, args?.status, args?.q);
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.message ?? err.message ?? 'Failed to load products');
    }
  },
);

export const fetchProductById = createAsyncThunk(
  'product/fetchById',
  async (id: string, { rejectWithValue }) => {
    try {
      return await productsApi.getById(id);
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.message ?? err.message ?? 'Failed to load product');
    }
  },
);

export const createProduct = createAsyncThunk(
  'product/create',
  async (payload: ProductFormValues, { rejectWithValue }) => {
    try {
      return await productsApi.create(payload);
    } catch (err: any) {
      // 422 carries Zod issues — surface the first one, which names the field.
      const issue = err.response?.data?.issues?.[0];
      return rejectWithValue(
        issue ? `${issue.path?.join('.') ?? 'field'}: ${issue.message}`
              : err.response?.data?.message ?? err.message ?? 'Failed to create product',
      );
    }
  },
);

export const updateProduct = createAsyncThunk(
  'product/update',
  async ({ id, payload }: { id: string; payload: Partial<ProductFormValues> }, { rejectWithValue }) => {
    try {
      return await productsApi.update(id, payload);
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.message ?? err.message ?? 'Failed to update product');
    }
  },
);

export const deleteProduct = createAsyncThunk(
  'product/delete',
  async (id: string, { rejectWithValue }) => {
    try {
      await productsApi.remove(id);
      return id;
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.message ?? err.message ?? 'Failed to archive product');
    }
  },
);

interface ProductState {
  products:       Product[];
  currentProduct: Product | null;
  status:         'idle' | 'loading' | 'succeeded' | 'failed';
  error:          string | null;
  total:          number;
  lastPage:       number;
}

const initialState: ProductState = {
  products:       [],
  currentProduct: null,
  status:         'idle',
  error:          null,
  total:          0,
  lastPage:       0,
};

export const productSlice = createSlice({
  name: 'product',
  initialState,
  reducers: {
    clearProductError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchProducts.pending, (state) => {
        state.status = 'loading';
        state.error  = null;
      })
      .addCase(fetchProducts.fulfilled, (state, action) => {
        state.status   = 'succeeded';
        state.products = action.payload.data;
        state.total    = action.payload.meta.total;
        state.lastPage = action.payload.meta.last_page;
      })
      .addCase(fetchProducts.rejected, (state, action) => {
        state.status = 'failed';
        state.error  = (action.payload as string) ?? action.error.message ?? null;
      })
      .addCase(fetchProductById.fulfilled, (state, action) => {
        state.currentProduct = action.payload;
      })
      // Saving is a loading state too. Only the list fetch set one, so
      // `isLoading` stayed false for the whole of a create: the submit button
      // never showed a spinner and never disabled itself, so a seller on a slow
      // connection could press Save three times and file three listings.
      .addCase(createProduct.pending, (state) => {
        state.status = 'loading';
        state.error  = null;
      })
      // A newly created product is PENDING_APPROVAL, so prepending it to the
      // list is what makes the "awaiting review" badge appear immediately
      // rather than only after the next fetch.
      .addCase(createProduct.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.products.unshift(action.payload);
        state.total += 1;
      })
      .addCase(createProduct.rejected, (state, action) => {
        state.status = 'failed';
        state.error = (action.payload as string) ?? action.error.message ?? null;
      })
      .addCase(updateProduct.pending, (state) => {
        state.status = 'loading';
        state.error  = null;
      })
      .addCase(updateProduct.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const idx = state.products.findIndex((p) => p.id === action.payload.id);
        if (idx !== -1) state.products[idx] = action.payload;
        state.currentProduct = action.payload;
      })
      .addCase(updateProduct.rejected, (state, action) => {
        state.status = 'failed';
        state.error = (action.payload as string) ?? action.error.message ?? null;
      })
      .addCase(deleteProduct.fulfilled, (state, action) => {
        state.products = state.products.filter((p) => p.id !== action.payload);
        state.total = Math.max(0, state.total - 1);
      })
      .addCase(deleteProduct.rejected, (state, action) => {
        state.error = (action.payload as string) ?? action.error.message ?? null;
      });
  },
});

export const { clearProductError } = productSlice.actions;
export default productSlice.reducer;
