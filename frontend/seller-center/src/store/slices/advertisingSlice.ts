import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { advertisingApi } from '../../api/advertising.api';
import type { Campaign } from '../../types/advertising.types';

export const fetchCampaigns = createAsyncThunk('advertising/fetchCampaigns', async () => {
  return await advertisingApi.listCampaigns();
});

export const createCampaign = createAsyncThunk(
  'advertising/createCampaign',
  async (campaign: Omit<Campaign, 'id'> & { id?: string }) => {
    return await advertisingApi.createCampaign(campaign);
  }
);

export const updateCampaign = createAsyncThunk(
  'advertising/updateCampaign',
  async ({ id, patch }: { id: string; patch: Partial<Campaign> }) => {
    return await advertisingApi.updateCampaign(id, patch);
  }
);

interface AdvertisingState {
  campaigns: Campaign[];
  loading: boolean;
  error: string | null;
}

const initialState: AdvertisingState = {
  campaigns: [],
  loading: false,
  error: null,
};

export const advertisingSlice = createSlice({
  name: 'advertising',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchCampaigns.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchCampaigns.fulfilled, (state, action) => {
        state.loading = false;
        state.campaigns = action.payload;
      })
      .addCase(fetchCampaigns.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to load campaigns';
      })
      .addCase(createCampaign.fulfilled, (state, action) => {
        state.campaigns = [action.payload, ...state.campaigns];
      })
      .addCase(updateCampaign.fulfilled, (state, action) => {
        state.campaigns = state.campaigns.map((c) => (c.id === action.payload.id ? action.payload : c));
      });
  },
});

export default advertisingSlice.reducer;
