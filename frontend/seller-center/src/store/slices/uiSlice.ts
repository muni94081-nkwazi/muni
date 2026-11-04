import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export type ThemeMode = 'light' | 'dark';

interface UiState {
  toasts: Toast[];
  theme: ThemeMode;
}

const initialState: UiState = {
  toasts: [],
  theme: 'light',
};

export const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    showToast: (state, action: PayloadAction<Omit<Toast, 'id'>>) => {
      const id = Date.now().toString();
      state.toasts.push({ ...action.payload, id });
    },
    hideToast: (state, action: PayloadAction<string>) => {
      state.toasts = state.toasts.filter((t) => t.id !== action.payload);
    },
    setTheme: (state, action: PayloadAction<ThemeMode>) => {
      state.theme = action.payload;
    },
  },
});

export const { showToast, hideToast, setTheme } = uiSlice.actions;
export default uiSlice.reducer;
