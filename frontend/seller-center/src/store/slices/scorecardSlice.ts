import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { scorecardApi } from '../../api/scorecard.api';
import type { HealthScorecard } from '../../types/scorecard.types';

// NOTE: this slice is not registered in the store and nothing dispatches it —
// ScorecardSection and AnalyticsPage both call scorecardApi directly. It is
// kept compiling against the real API rather than the removed mock one, but it
// is dead code and a candidate for deletion.
//
// The appeals thunks that used to live here are gone: there is no appeals
// backend, so scorecardApi no longer offers listAppeals/submitAppeal at all.

export const fetchHealthScorecard = createAsyncThunk(
  'scorecard/fetchHealthScorecard',
  async (sellerId: string) => {
    return await scorecardApi.getHealthScorecard(sellerId);
  },
);

interface ScorecardState {
  scorecard: HealthScorecard | null;
  loading: boolean;
  error: string | null;
}

const initialState: ScorecardState = {
  scorecard: null,
  loading: false,
  error: null,
};

export const scorecardSlice = createSlice({
  name: 'scorecard',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchHealthScorecard.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchHealthScorecard.fulfilled, (state, action) => {
        state.loading = false;
        state.scorecard = action.payload;
      })
      .addCase(fetchHealthScorecard.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to load health scorecard';
      });
  },
});

export default scorecardSlice.reducer;
