import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type ThemePreference = 'light' | 'dark' | 'system';

export interface UiState {
  currency: string;
  language: string;
  theme: ThemePreference;
  isOnline: boolean;
  /** User preference: disables autoplay media and swaps banners/images for low-res variants. */
  isLowDataMode: boolean;
}

const initialState: UiState = {
  currency: 'USD',
  language: 'en',
  theme: 'system',
  isOnline: true,
  isLowDataMode: false,
};

/**
 * Device-local preferences.
 *
 * These reducers used to call `AsyncStorage.setItem(...)` inline. Reducers must
 * be pure — Redux Toolkit replays them under Immer and in dev double-invokes
 * them, so persistence belonged outside. It now lives in a store subscription
 * (see `subscribeUiPersistence` in src/store/index.ts), which writes whenever a
 * persisted field actually changes.
 */
export const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    /** Applies preferences read back from AsyncStorage at startup. */
    hydrateUi(state, action: PayloadAction<Partial<UiState>>) {
      return { ...state, ...action.payload };
    },
    setCurrency(state, action: PayloadAction<string>) {
      state.currency = action.payload;
    },
    setLanguage(state, action: PayloadAction<string>) {
      state.language = action.payload;
    },
    setTheme(state, action: PayloadAction<ThemePreference>) {
      state.theme = action.payload;
    },
    setIsOnline(state, action: PayloadAction<boolean>) {
      state.isOnline = action.payload;
    },
    setLowDataMode(state, action: PayloadAction<boolean>) {
      state.isLowDataMode = action.payload;
    },
  },
});

export const { hydrateUi, setCurrency, setLanguage, setTheme, setIsOnline, setLowDataMode } =
  uiSlice.actions;

export default uiSlice.reducer;
