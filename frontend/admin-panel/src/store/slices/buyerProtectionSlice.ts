import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { buyerProtectionApi } from '@/api/buyerProtection.api';
import type { ProtectionClaim, RefundDecision } from '@/types/buyerProtection.types';

// Intentionally a separate slice from `disputeSlice.ts` — buyer protection claims are a
// distinct arbitration surface from seller/buyer disputes, even though the UI patterns rhyme.
interface BuyerProtectionState {
  claims: ProtectionClaim[];
  total: number;
  loading: boolean;
  applyingDecisionFor: string | null;
}

const initialState: BuyerProtectionState = { claims: [], total: 0, loading: false, applyingDecisionFor: null };

export const fetchClaimsThunk = createAsyncThunk(
  'buyerProtection/fetchClaims',
  async ({ page, status }: { page?: number; status?: string } = {}) => {
    const res = await buyerProtectionApi.list(page, 50, status);
    return res.data;
  }
);

export const applyRefundDecisionThunk = createAsyncThunk(
  'buyerProtection/applyDecision',
  async ({ claimId, decision, notes }: { claimId: string; decision: RefundDecision; notes?: string }) => {
    const res = await buyerProtectionApi.applyDecision(claimId, decision, notes);
    return res.data;
  }
);

const buyerProtectionSlice = createSlice({
  name: 'buyerProtection',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchClaimsThunk.pending, (state) => { state.loading = true; })
      .addCase(fetchClaimsThunk.fulfilled, (state, action) => {
        state.loading = false;
        state.claims = action.payload.items;
        state.total = action.payload.total;
      })
      .addCase(fetchClaimsThunk.rejected, (state) => { state.loading = false; })
      .addCase(applyRefundDecisionThunk.pending, (state, action) => {
        state.applyingDecisionFor = action.meta.arg.claimId;
      })
      .addCase(applyRefundDecisionThunk.fulfilled, (state, action) => {
        state.applyingDecisionFor = null;
        const updated = action.payload;
        const idx = state.claims.findIndex((c) => c.id === updated.id);
        if (idx !== -1) state.claims[idx] = updated;
      })
      .addCase(applyRefundDecisionThunk.rejected, (state) => { state.applyingDecisionFor = null; });
  },
});

export default buyerProtectionSlice.reducer;
