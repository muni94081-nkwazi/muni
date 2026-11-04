import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { LOW_DATA_MODE_KEY } from '@/utils/constants';
import { safeGetItem, safeSetItem } from '@/utils/helpers';

export interface Toast {
  id: string;
  message: string;
  variant: 'success' | 'error' | 'info';
}

interface UiState {
  toasts: Toast[];
  isCartDrawerOpen: boolean;
  isMobileNavOpen: boolean;
  /** User preference: disables autoplay media and swaps banners/images for low-res variants. */
  isLowDataMode: boolean;
}

const initialState: UiState = {
  toasts: [],
  isCartDrawerOpen: false,
  isMobileNavOpen: false,
  isLowDataMode: safeGetItem(LOW_DATA_MODE_KEY) === 'true',
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    showToast: {
      reducer(state, action: PayloadAction<Toast>) {
        state.toasts.push(action.payload);
      },
      prepare(message: string, variant: Toast['variant'] = 'info') {
        return { payload: { id: crypto.randomUUID(), message, variant } };
      },
    },
    dismissToast(state, action: PayloadAction<string>) {
      state.toasts = state.toasts.filter((t) => t.id !== action.payload);
    },
    openCartDrawer(state) {
      state.isCartDrawerOpen = true;
    },
    closeCartDrawer(state) {
      state.isCartDrawerOpen = false;
    },
    toggleMobileNav(state) {
      state.isMobileNavOpen = !state.isMobileNavOpen;
    },
    closeMobileNav(state) {
      state.isMobileNavOpen = false;
    },
    setLowDataMode(state, action: PayloadAction<boolean>) {
      state.isLowDataMode = action.payload;
      safeSetItem(LOW_DATA_MODE_KEY, String(action.payload));
    },
  },
});

export const {
  showToast,
  dismissToast,
  openCartDrawer,
  closeCartDrawer,
  toggleMobileNav,
  closeMobileNav,
  setLowDataMode,
} = uiSlice.actions;
export default uiSlice.reducer;
