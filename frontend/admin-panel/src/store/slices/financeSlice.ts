import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { financeApi, type WithdrawalFilters } from '@/api/finance.api';
import type { FinanceSummary, PageMeta, Withdrawal } from '@/types/payout.types';

interface FinanceState {
  summary: FinanceSummary | null;
  withdrawals: Withdrawal[];
  meta: PageMeta | null;
  loading: boolean;
  /** Id of the withdrawal currently being approved or rejected, if any. */
  actioningId: string | null;
  error: string | null;
}

export const initialState: FinanceState = {
  summary: null,
  withdrawals: [],
  meta: null,
  loading: false,
  actioningId: null,
  error: null,
};

function messageOf(err: any, fallback: string): string {
  return err?.response?.data?.error?.message ?? err?.response?.data?.message ?? err?.message ?? fallback;
}

export const fetchFinanceSummaryThunk = createAsyncThunk(
  'finance/fetchSummary',
  async (_: void, { rejectWithValue }) => {
    try {
      return await financeApi.getSummary();
    } catch (err: any) {
      return rejectWithValue(messageOf(err, 'Failed to load finance summary'));
    }
  },
);

export const fetchWithdrawalsThunk = createAsyncThunk(
  'finance/fetchWithdrawals',
  async ({ page, ...filters }: { page?: number } & WithdrawalFilters, { rejectWithValue }) => {
    try {
      return await financeApi.listWithdrawals(page ?? 1, 20, filters);
    } catch (err: any) {
      return rejectWithValue(messageOf(err, 'Failed to load withdrawal requests'));
    }
  },
);

export const approveWithdrawalThunk = createAsyncThunk(
  'finance/approveWithdrawal',
  async (id: string, { rejectWithValue }) => {
    try {
      return await financeApi.approve(id);
    } catch (err: any) {
      return rejectWithValue(messageOf(err, 'Failed to approve withdrawal'));
    }
  },
);

export const rejectWithdrawalThunk = createAsyncThunk(
  'finance/rejectWithdrawal',
  async ({ id, reason }: { id: string; reason: string }, { rejectWithValue }) => {
    try {
      return await financeApi.reject(id, reason);
    } catch (err: any) {
      return rejectWithValue(messageOf(err, 'Failed to reject withdrawal'));
    }
  },
);

/** Both decisions return the updated row; splice it in rather than refetching the page. */
function replaceWithdrawal(state: FinanceState, updated: Withdrawal): void {
  const index = state.withdrawals.findIndex((w) => w.id === updated.id);
  if (index !== -1) state.withdrawals[index] = updated;
}

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
      .addCase(fetchFinanceSummaryThunk.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchFinanceSummaryThunk.fulfilled, (state, action) => {
        state.loading = false;
        state.summary = action.payload;
      })
      .addCase(fetchFinanceSummaryThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = (action.payload as string) ?? action.error.message ?? null;
      })

      .addCase(fetchWithdrawalsThunk.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchWithdrawalsThunk.fulfilled, (state, action) => {
        state.loading = false;
        state.withdrawals = action.payload.data;
        state.meta = action.payload.meta;
      })
      .addCase(fetchWithdrawalsThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = (action.payload as string) ?? action.error.message ?? null;
      })

      .addCase(approveWithdrawalThunk.pending, (state, action) => {
        state.actioningId = action.meta.arg;
        state.error = null;
      })
      .addCase(approveWithdrawalThunk.fulfilled, (state, action) => {
        state.actioningId = null;
        replaceWithdrawal(state, action.payload);
      })
      .addCase(approveWithdrawalThunk.rejected, (state, action) => {
        state.actioningId = null;
        state.error = (action.payload as string) ?? action.error.message ?? null;
      })

      .addCase(rejectWithdrawalThunk.pending, (state, action) => {
        state.actioningId = action.meta.arg.id;
        state.error = null;
      })
      .addCase(rejectWithdrawalThunk.fulfilled, (state, action) => {
        state.actioningId = null;
        replaceWithdrawal(state, action.payload);
      })
      .addCase(rejectWithdrawalThunk.rejected, (state, action) => {
        state.actioningId = null;
        state.error = (action.payload as string) ?? action.error.message ?? null;
      });
  },
});

export const { clearFinanceError } = financeSlice.actions;
export default financeSlice.reducer;
