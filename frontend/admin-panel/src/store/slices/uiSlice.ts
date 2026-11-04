import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
}

export type ThemeMode = 'light' | 'dark';

interface UiState {
  sidebarOpen: boolean;
  toasts: ToastMessage[];
  theme: ThemeMode;
}

const initialState: UiState = {
  sidebarOpen: true,
  toasts: [],
  theme: 'light',
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    toggleSidebar(state) {
      state.sidebarOpen = !state.sidebarOpen;
    },
    addToast(state, action: PayloadAction<Omit<ToastMessage, 'id'>>) {
      state.toasts.push({
        ...action.payload,
        id: Date.now().toString(),
      });
    },
    removeToast(state, action: PayloadAction<string>) {
      state.toasts = state.toasts.filter(t => t.id !== action.payload);
    },
    setTheme(state, action: PayloadAction<ThemeMode>) {
      state.theme = action.payload;
    },
  }
});

export const { toggleSidebar, addToast, removeToast, setTheme } = uiSlice.actions;
export default uiSlice.reducer;
