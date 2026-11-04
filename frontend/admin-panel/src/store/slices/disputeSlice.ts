import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { disputesApi } from '@/api/disputes.api';
import type { Dispute } from '@/types/dispute.types';

interface DisputeState {
  disputes: Dispute[];
  total: number;
  loading: boolean;
}

const initialState: DisputeState = { disputes: [], total: 0, loading: false };

export const fetchDisputesThunk = createAsyncThunk('dispute/fetchDisputes', async ({ page, status }: { page?: number; status?: string }) => {
  const res = await disputesApi.list(page, 20, status);
  return res.data;
});

const disputeSlice = createSlice({
  name: 'dispute',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchDisputesThunk.pending, (state) => { state.loading = true; })
      .addCase(fetchDisputesThunk.fulfilled, (state, action) => {
        state.loading = false;
        state.disputes = action.payload.items;
        state.total = action.payload.total;
      });
  }
});
export const resolveDisputeThunk = createAsyncThunk('dispute/resolveDispute', async (payload: any) => payload);
export default disputeSlice.reducer;
