import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { dashboardApi } from '@/api/dashboard.api';
import type {
  DashboardStats,
  DashboardStatsMeta,
  RecentOrder,
  RecentSeller,
} from '@/types/dashboard.types';

interface DashboardState {
  stats: DashboardStats | null;
  statsMeta: DashboardStatsMeta | null;
  recentOrders: RecentOrder[];
  recentSellers: RecentSeller[];
  loading: boolean;
  feedsLoading: boolean;
  error: string | null;
}

const initialState: DashboardState = {
  stats: null,
  statsMeta: null,
  recentOrders: [],
  recentSellers: [],
  loading: false,
  feedsLoading: false,
  error: null,
};

function messageOf(err: any, fallback: string): string {
  return err?.response?.data?.error?.message ?? err?.response?.data?.message ?? err?.message ?? fallback;
}

export const fetchDashboardStatsThunk = createAsyncThunk(
  'dashboard/fetchStats',
  async (_: void, { rejectWithValue }) => {
    try {
      return await dashboardApi.getStats();
    } catch (err: any) {
      return rejectWithValue(messageOf(err, 'Failed to load dashboard stats'));
    }
  },
);

export const fetchRecentOrdersThunk = createAsyncThunk(
  'dashboard/fetchRecentOrders',
  async (limit: number | undefined, { rejectWithValue }) => {
    try {
      return await dashboardApi.getRecentOrders(limit ?? 10);
    } catch (err: any) {
      return rejectWithValue(messageOf(err, 'Failed to load recent orders'));
    }
  },
);

export const fetchRecentSellersThunk = createAsyncThunk(
  'dashboard/fetchRecentSellers',
  async (limit: number | undefined, { rejectWithValue }) => {
    try {
      return await dashboardApi.getRecentSellers(limit ?? 10);
    } catch (err: any) {
      return rejectWithValue(messageOf(err, 'Failed to load recent sellers'));
    }
  },
);

const dashboardSlice = createSlice({
  name: 'dashboard',
  initialState,
  reducers: {
    clearDashboardError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchDashboardStatsThunk.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchDashboardStatsThunk.fulfilled, (state, action) => {
        state.loading = false;
        state.stats = action.payload.stats;
        state.statsMeta = action.payload.meta;
      })
      .addCase(fetchDashboardStatsThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = (action.payload as string) ?? action.error.message ?? 'Failed to load dashboard stats';
      })

      // The two feeds share `feedsLoading` but not `error`: a failed activity
      // feed should not blank out stats that loaded fine, so it leaves the list
      // empty and lets the panel render its own empty state.
      .addCase(fetchRecentOrdersThunk.pending, (state) => {
        state.feedsLoading = true;
      })
      .addCase(fetchRecentOrdersThunk.fulfilled, (state, action) => {
        state.feedsLoading = false;
        state.recentOrders = action.payload;
      })
      .addCase(fetchRecentOrdersThunk.rejected, (state) => {
        state.feedsLoading = false;
        state.recentOrders = [];
      })

      .addCase(fetchRecentSellersThunk.fulfilled, (state, action) => {
        state.recentSellers = action.payload;
      })
      .addCase(fetchRecentSellersThunk.rejected, (state) => {
        state.recentSellers = [];
      });
  },
});

export const { clearDashboardError } = dashboardSlice.actions;
export default dashboardSlice.reducer;
