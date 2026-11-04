import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { ordersApi, type OrderFilters } from '@/api/orders.api';
import type { Order, PageMeta } from '@/types/order.types';

interface OrderState {
  orders:  Order[];
  meta:    PageMeta | null;
  total:   number;
  loading: boolean;
  error:   string | null;
}

const initialState: OrderState = {
  orders:  [],
  meta:    null,
  total:   0,
  loading: false,
  error:   null,
};

export const fetchOrdersThunk = createAsyncThunk(
  'order/fetchOrders',
  async (
    { page, ...filters }: { page?: number } & OrderFilters,
    { rejectWithValue },
  ) => {
    try {
      return await ordersApi.list(page ?? 1, 20, filters);
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.message ?? err.message ?? 'Failed to load orders');
    }
  },
);

const orderSlice = createSlice({
  name: 'order',
  initialState,
  reducers: {
    clearOrderError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchOrdersThunk.pending, (state) => {
        state.loading = true;
        state.error   = null;
      })
      .addCase(fetchOrdersThunk.fulfilled, (state, action) => {
        state.loading = false;
        state.orders  = action.payload.data;
        state.meta    = action.payload.meta;
        state.total   = action.payload.meta.total;
      })
      // The previous slice had no rejected case at all, so a failed request left
      // `loading` stuck true and the table spinning forever.
      .addCase(fetchOrdersThunk.rejected, (state, action) => {
        state.loading = false;
        state.error   = (action.payload as string) ?? action.error.message ?? null;
      });
  },
});

export const { clearOrderError } = orderSlice.actions;
export default orderSlice.reducer;
