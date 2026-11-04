import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { ordersApi, type FulfillmentUpdate } from '../../api/orders.api';
import type { SubOrder, SubOrderStatus, PageMeta } from '../../types/order.types';

interface ListArgs {
  page?:   number;
  status?: SubOrderStatus;
}

// No vendorId argument: the seller comes from the JWT the gateway verifies.
export const fetchOrders = createAsyncThunk(
  'order/fetchOrders',
  async (args: ListArgs | undefined, { rejectWithValue }) => {
    try {
      return await ordersApi.list(args?.page ?? 1, 15, args?.status);
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.message ?? err.message ?? 'Failed to load orders');
    }
  },
);

export const fetchOrderById = createAsyncThunk(
  'order/fetchById',
  async (id: string, { rejectWithValue }) => {
    try {
      return await ordersApi.getById(id);
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.message ?? err.message ?? 'Failed to load order');
    }
  },
);

export const updateOrderStatus = createAsyncThunk(
  'order/updateStatus',
  async (
    { id, status, fulfillment }: { id: string; status: SubOrderStatus; fulfillment?: FulfillmentUpdate },
    { rejectWithValue },
  ) => {
    try {
      return await ordersApi.updateStatus(id, status, fulfillment);
    } catch (err: any) {
      // order-service rejects an invalid transition with a 400 naming it —
      // surfacing that message is more useful than a generic failure.
      return rejectWithValue(err.response?.data?.message ?? err.message ?? 'Could not update the order');
    }
  },
);

interface OrderState {
  orders:       SubOrder[];
  currentOrder: SubOrder | null;
  status:       'idle' | 'loading' | 'succeeded' | 'failed';
  error:        string | null;
  meta:         PageMeta | null;
}

const initialState: OrderState = {
  orders:       [],
  currentOrder: null,
  status:       'idle',
  error:        null,
  meta:         null,
};

export const orderSlice = createSlice({
  name: 'order',
  initialState,
  reducers: {
    clearOrderError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchOrders.pending, (state) => {
        state.status = 'loading';
        state.error  = null;
      })
      .addCase(fetchOrders.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.orders = action.payload.data;
        state.meta   = action.payload.meta;
      })
      .addCase(fetchOrders.rejected, (state, action) => {
        state.status = 'failed';
        state.error  = (action.payload as string) ?? action.error.message ?? null;
      })
      .addCase(fetchOrderById.fulfilled, (state, action) => {
        state.currentOrder = action.payload;
      })
      .addCase(fetchOrderById.rejected, (state, action) => {
        state.error = (action.payload as string) ?? action.error.message ?? null;
      })
      // Patch the row in place so the fulfilment page reflects the new status
      // without the caller having to re-fetch the whole list.
      .addCase(updateOrderStatus.fulfilled, (state, action) => {
        const idx = state.orders.findIndex((o) => o.id === action.payload.id);
        if (idx !== -1) state.orders[idx] = action.payload;
        state.currentOrder = action.payload;
      })
      .addCase(updateOrderStatus.rejected, (state, action) => {
        state.error = (action.payload as string) ?? action.error.message ?? null;
      });
  },
});

export const { clearOrderError } = orderSlice.actions;
export default orderSlice.reducer;
