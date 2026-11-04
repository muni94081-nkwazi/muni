import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { storefrontApi } from '../../api/storefront.api';
import type { CarouselItem, StorefrontBanner, StorefrontConfig } from '../../types/storefront.types';

interface StorefrontState {
  config: StorefrontConfig | null;
  loading: boolean;
  error: string | null;
}

const initialState: StorefrontState = {
  config: null,
  loading: false,
  error: null,
};

type StorefrontRootState = { storefront: StorefrontState };

export const fetchStorefrontConfig = createAsyncThunk('storefront/fetchConfig', async () => {
  return await storefrontApi.getConfig();
});

export const saveStorefrontConfig = createAsyncThunk(
  'storefront/saveConfig',
  async (config: StorefrontConfig) => {
    return await storefrontApi.saveConfig(config);
  }
);

export const saveBanners = createAsyncThunk(
  'storefront/saveBanners',
  async (banners: StorefrontBanner[], { getState }) => {
    const { config } = (getState() as StorefrontRootState).storefront;
    if (!config) throw new Error('Storefront config not loaded');
    return await storefrontApi.saveConfig({ ...config, banners });
  }
);

export const saveCarousel = createAsyncThunk(
  'storefront/saveCarousel',
  async (carousel: CarouselItem[], { getState }) => {
    const { config } = (getState() as StorefrontRootState).storefront;
    if (!config) throw new Error('Storefront config not loaded');
    return await storefrontApi.saveConfig({ ...config, carousel });
  }
);

export const saveSlug = createAsyncThunk(
  'storefront/saveSlug',
  async (customUrlSlug: string, { getState }) => {
    const { config } = (getState() as StorefrontRootState).storefront;
    if (!config) throw new Error('Storefront config not loaded');
    return await storefrontApi.saveConfig({ ...config, customUrlSlug });
  }
);

export const storefrontSlice = createSlice({
  name: 'storefront',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchStorefrontConfig.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchStorefrontConfig.fulfilled, (state, action) => {
        state.loading = false;
        state.config = action.payload;
      })
      .addCase(fetchStorefrontConfig.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to load storefront config';
      })
      .addCase(saveStorefrontConfig.fulfilled, (state, action) => {
        state.config = action.payload;
      })
      .addCase(saveBanners.fulfilled, (state, action) => {
        state.config = action.payload;
      })
      .addCase(saveCarousel.fulfilled, (state, action) => {
        state.config = action.payload;
      })
      .addCase(saveSlug.fulfilled, (state, action) => {
        state.config = action.payload;
      });
  },
});

export default storefrontSlice.reducer;
