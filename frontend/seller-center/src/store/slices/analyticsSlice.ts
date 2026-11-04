import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { analyticsApi } from '../../api/analytics.api';

export const fetchOverview = createAsyncThunk('analytics/fetchOverview', async (_vendorId: string) => {
  return await analyticsApi.getOverview();
});

export const fetchSalesData = createAsyncThunk('analytics/fetchSalesData', async ({ period }: { vendorId?: string; period?: number }) => {
  return await analyticsApi.getSalesData(period);
});

const initialState = {
  overview: null as any | null,
  salesData: null as any | null,
  topProducts: [] as any[],
  status: 'idle',
};

export const analyticsSlice = createSlice({
  name: 'analytics',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchOverview.fulfilled, (state, action) => {
        state.overview = action.payload;
      })
      .addCase(fetchSalesData.fulfilled, (state, action) => {
        state.salesData = action.payload;
      });
  },
});

export default analyticsSlice.reducer;
