import { configureStore } from '@reduxjs/toolkit';
import rootReducer from './rootReducer';

export const store = configureStore({
  reducer: rootReducer,
  // The default immutable/serializable-state checks walk the entire store on every
  // dispatch and trip their 32ms warning threshold on this app's chart-heavy mock
  // state well before anything is actually wrong. Both checks are dev-only (no-op
  // in production builds) and exist purely to catch accidental mutation/non-serializable
  // values — raise the threshold instead of chasing false-positive console noise.
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      immutableCheck: { warnAfter: 128 },
      serializableCheck: { warnAfter: 128 },
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
