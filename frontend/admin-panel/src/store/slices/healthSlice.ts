import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { healthApi } from '@/api/health.api';
import type { ServiceHealthRecord } from '@/types/health.types';

interface HealthState {
  services: ServiceHealthRecord[];
  loading: boolean;
  error: string | null;
}

const initialState: HealthState = { services: [], loading: false, error: null };

export const fetchServiceHealthThunk = createAsyncThunk('health/fetchServices', async () => {
  const res = await healthApi.getServiceHealth();
  return res.data;
});

const healthSlice = createSlice({
  name: 'health',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchServiceHealthThunk.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchServiceHealthThunk.fulfilled, (state, action) => {
        state.loading = false;
        state.services = action.payload;
      })
      .addCase(fetchServiceHealthThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? 'Failed to load service health';
      });
  },
});

export const selectHealthState = (state: { health: HealthState }): HealthState => state.health;

export default healthSlice.reducer;
