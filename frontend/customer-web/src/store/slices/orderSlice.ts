import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { ordersApi } from '@/api/orders.api';
import { paymentApi } from '@/api/payment.api';
import type { CreateOrderPayload, InitiatePaymentPayload, Order } from '@/types/order.types';
import type { PaginatedMeta } from '@/types/api.types';
import { errorMessage } from '@/utils/helpers';

interface OrderState {
  orders: Order[];
  meta: PaginatedMeta | null;
  currentOrder: Order | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: OrderState = {
  orders: [],
  meta: null,
  currentOrder: null,
  status: 'idle',
  error: null,
};

export const fetchOrders = createAsyncThunk(
  'orders/fetchOrders',
  async (page: number | undefined, { rejectWithValue }) => {
    try {
      return await ordersApi.list(page ?? 1);
    } catch (error) {
      return rejectWithValue(errorMessage(error, 'Could not load your orders'));
    }
  },
);

export const fetchOrderById = createAsyncThunk(
  'orders/fetchOrderById',
  async (id: string, { rejectWithValue }) => {
    try {
      return await ordersApi.getById(id);
    } catch (error) {
      return rejectWithValue(errorMessage(error, 'Could not load this order'));
    }
  },
);

export const createOrder = createAsyncThunk(
  'orders/createOrder',
  async (payload: CreateOrderPayload, { rejectWithValue }) => {
    try {
      return await ordersApi.create(payload);
    } catch (error) {
      return rejectWithValue(errorMessage(error, 'Could not place your order'));
    }
  },
);

export const initiateOrderPayment = createAsyncThunk(
  'orders/initiatePayment',
  async (payload: { orderId: string; details: InitiatePaymentPayload }, { rejectWithValue }) => {
    try {
      return await paymentApi.initiatePayment(payload.orderId, payload.details);
    } catch (error) {
      return rejectWithValue(errorMessage(error, 'Could not start the payment'));
    }
  },
);

export const pollOrderStatus = createAsyncThunk(
  'orders/pollStatus',
  async (orderId: string, { rejectWithValue }) => {
    try {
      return await paymentApi.pollOrderStatus(orderId);
    } catch (error) {
      return rejectWithValue(errorMessage(error, 'Could not check payment status'));
    }
  },
);

export const cancelOrder = createAsyncThunk(
  'orders/cancelOrder',
  async (payload: { id: string; reason: string }, { rejectWithValue }) => {
    try {
      return await ordersApi.cancel(payload.id, payload.reason);
    } catch (error) {
      return rejectWithValue(errorMessage(error, 'Could not cancel this order'));
    }
  },
);

const orderSlice = createSlice({
  name: 'orders',
  initialState,
  reducers: {
    clearCurrentOrder(state) {
      state.currentOrder = null;
    },
    clearOrderError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchOrders.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(fetchOrders.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.orders = action.payload.data;
        state.meta = action.payload.meta;
      })
      .addCase(fetchOrders.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      });

    builder.addMatcher(
      (action): action is PayloadAction<Order> =>
        [fetchOrderById.fulfilled.type, createOrder.fulfilled.type, initiateOrderPayment.fulfilled.type,
         pollOrderStatus.fulfilled.type, cancelOrder.fulfilled.type].includes(action.type),
      (state, action) => {
        state.status = 'succeeded';
        state.currentOrder = action.payload;
      },
    );

    builder.addMatcher(
      (action): action is PayloadAction<string> =>
        [fetchOrderById.rejected.type, createOrder.rejected.type, initiateOrderPayment.rejected.type,
         pollOrderStatus.rejected.type, cancelOrder.rejected.type].includes(action.type),
      (state, action) => {
        state.status = 'failed';
        state.error = action.payload;
      },
    );

    builder.addMatcher(
      (action) =>
        [createOrder.pending.type, initiateOrderPayment.pending.type, cancelOrder.pending.type].includes(action.type),
      (state) => {
        state.status = 'loading';
        state.error = null;
      },
    );
  },
});

export const { clearCurrentOrder, clearOrderError } = orderSlice.actions;
export default orderSlice.reducer;
