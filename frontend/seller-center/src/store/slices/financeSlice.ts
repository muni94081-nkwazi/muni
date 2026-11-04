import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { financeApi, type WithdrawalRequest } from '../../api/finance.api';
import type {
  Earnings,
  FinancePageMeta,
  FinanceTransaction,
  Withdrawal,
} from '../../types/finance.types';

interface FinanceState {
  earnings: Earnings | null;
  transactions: FinanceTransaction[];
  transactionsMeta: FinancePageMeta | null;
  withdrawals: Withdrawal[];
  loading: boolean;
  requesting: boolean;
  error: string | null;
}

const initialState: FinanceState = {
  earnings: null,
  transactions: [],
  transactionsMeta: null,
  withdrawals: [],
  loading: false,
  requesting: false,
  error: null,
};

// payment-service returns { success: false, message } on a rejected withdrawal
// (below minimum, insufficient balance); the gateway wraps errors as
// { error: { message } }. Both carry the reason the seller needs to see, so the
// generic "Request failed with status code 400" is the last resort, not the first.
function messageOf(err: any, fallback: string): string {
  return err?.response?.data?.error?.message ?? err?.response?.data?.message ?? err?.message ?? fallback;
}

export const fetchEarningsThunk = createAsyncThunk(
  'finance/fetchEarnings',
  async (_: void, { rejectWithValue }) => {
    try {
      return await financeApi.getEarnings();
    } catch (err: any) {
      return rejectWithValue(messageOf(err, 'Failed to load earnings'));
    }
  },
);

export const fetchTransactionsThunk = createAsyncThunk(
  'finance/fetchTransactions',
  async (page: number | undefined, { rejectWithValue }) => {
    try {
      return await financeApi.listTransactions(page ?? 1, 20);
    } catch (err: any) {
      return rejectWithValue(messageOf(err, 'Failed to load transactions'));
    }
  },
);

export const fetchWithdrawalsThunk = createAsyncThunk(
  'finance/fetchWithdrawals',
  async (_: void, { rejectWithValue }) => {
    try {
      const { data } = await financeApi.listWithdrawals(1, 20);
      return data;
    } catch (err: any) {
      return rejectWithValue(messageOf(err, 'Failed to load withdrawals'));
    }
  },
);

export const requestWithdrawalThunk = createAsyncThunk(
  'finance/requestWithdrawal',
  async (request: WithdrawalRequest, { rejectWithValue }) => {
    try {
      return await financeApi.requestWithdrawal(request);
    } catch (err: any) {
      return rejectWithValue(messageOf(err, 'Failed to request withdrawal'));
    }
  },
);

const financeSlice = createSlice({
  name: 'finance',
  initialState,
  reducers: {
    clearFinanceError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchEarningsThunk.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchEarningsThunk.fulfilled, (state, action) => {
        state.loading = false;
        state.earnings = action.payload;
      })
      .addCase(fetchEarningsThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = (action.payload as string) ?? action.error.message ?? null;
      })

      .addCase(fetchTransactionsThunk.fulfilled, (state, action) => {
        state.transactions = action.payload.data;
        state.transactionsMeta = action.payload.meta;
      })
      .addCase(fetchTransactionsThunk.rejected, (state, action) => {
        state.error = (action.payload as string) ?? action.error.message ?? null;
      })

      .addCase(fetchWithdrawalsThunk.fulfilled, (state, action) => {
        state.withdrawals = action.payload;
      })
      .addCase(fetchWithdrawalsThunk.rejected, (state, action) => {
        state.error = (action.payload as string) ?? action.error.message ?? null;
      })

      .addCase(requestWithdrawalThunk.pending, (state) => {
        state.requesting = true;
        state.error = null;
      })
      .addCase(requestWithdrawalThunk.fulfilled, (state, action) => {
        state.requesting = false;
        state.withdrawals.unshift(action.payload);
        // The reservation has already left the available balance server-side.
        // Mirroring it locally keeps the header honest until the refetch lands,
        // rather than briefly showing funds the seller can no longer withdraw.
        if (state.earnings) {
          state.earnings.availableBalance -= action.payload.amount;
          state.earnings.reservedBalance += action.payload.amount;
        }
      })
      .addCase(requestWithdrawalThunk.rejected, (state, action) => {
        state.requesting = false;
        state.error = (action.payload as string) ?? action.error.message ?? null;
      });
  },
});

export const { clearFinanceError } = financeSlice.actions;
export default financeSlice.reducer;
