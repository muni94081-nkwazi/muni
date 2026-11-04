import { configureStore } from '@reduxjs/toolkit';
import { rootReducer, type RootState } from './rootReducer';

export const store = configureStore({
  reducer: rootReducer,
});

export type AppDispatch = typeof store.dispatch;
export type { RootState };
