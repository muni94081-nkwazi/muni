import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { containersApi } from '@/api/containers.api';
import type { FreightContainer } from '@/types/container.types';

interface ContainerState {
  containers: FreightContainer[];
  total: number;
  loading: boolean;
}

const initialState: ContainerState = { containers: [], total: 0, loading: false };

export const fetchContainersThunk = createAsyncThunk(
  'containers/fetchContainers',
  async ({ page, status }: { page?: number; status?: string } = {}) => {
    const res = await containersApi.list(page, 50, status);
    return res.data;
  }
);

export const fetchContainerByIdThunk = createAsyncThunk(
  'containers/fetchContainerById',
  async (id: string) => {
    const res = await containersApi.getById(id);
    return res.data;
  }
);

const containerSlice = createSlice({
  name: 'containers',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchContainersThunk.pending, (state) => { state.loading = true; })
      .addCase(fetchContainersThunk.fulfilled, (state, action) => {
        state.loading = false;
        state.containers = action.payload.items;
        state.total = action.payload.total;
      })
      .addCase(fetchContainersThunk.rejected, (state) => { state.loading = false; })
      .addCase(fetchContainerByIdThunk.fulfilled, (state, action) => {
        const updated = action.payload;
        const idx = state.containers.findIndex((c) => c.id === updated.id);
        if (idx !== -1) state.containers[idx] = updated;
      });
  },
});

export default containerSlice.reducer;
