import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { verificationApi } from '@/api/verification.api';
import type { DecisionPayload } from '@/api/verification.api';
import type { VerificationApplication, VerificationDecision, CommissionOverride } from '@/types/kyc.types';

interface VerificationState {
  applications: VerificationApplication[];
  commissionOverrides: CommissionOverride[];
  loading: boolean;
  error: string | null;
}

const initialState: VerificationState = {
  applications: [],
  commissionOverrides: [],
  loading: false,
  error: null,
};

export const fetchApplicationsThunk = createAsyncThunk('verification/fetchApplications', async () => {
  return verificationApi.listApplications();
});

export const decideApplicationThunk = createAsyncThunk(
  'verification/decideApplication',
  async ({ id, decision, payload }: { id: string; decision: VerificationDecision; payload?: DecisionPayload }) => {
    return verificationApi.decideApplication(id, decision, payload);
  }
);

export const fetchCommissionOverridesThunk = createAsyncThunk('verification/fetchCommissionOverrides', async () => {
  return verificationApi.listCommissionOverrides();
});

export const setCommissionOverrideThunk = createAsyncThunk(
  'verification/setCommissionOverride',
  async (override: CommissionOverride) => {
    return verificationApi.setCommissionOverride(override);
  }
);

const verificationSlice = createSlice({
  name: 'verification',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchApplicationsThunk.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchApplicationsThunk.fulfilled, (state, action) => {
        state.loading = false;
        state.applications = action.payload;
      })
      .addCase(fetchApplicationsThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? 'Failed to load verification applications';
      })
      .addCase(decideApplicationThunk.pending, (state) => {
        state.loading = true;
      })
      .addCase(decideApplicationThunk.fulfilled, (state, action) => {
        state.loading = false;
        const idx = state.applications.findIndex((a) => a.id === action.payload.id);
        if (idx !== -1) state.applications[idx] = action.payload;
      })
      .addCase(decideApplicationThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? 'Failed to record decision';
      })
      .addCase(fetchCommissionOverridesThunk.fulfilled, (state, action) => {
        state.commissionOverrides = action.payload;
      })
      .addCase(setCommissionOverrideThunk.fulfilled, (state, action) => {
        state.commissionOverrides = [
          action.payload,
          ...state.commissionOverrides.filter(
            (o) => !(o.sellerId === action.payload.sellerId && o.categoryId === action.payload.categoryId)
          ),
        ];
      });
  },
});

export default verificationSlice.reducer;
