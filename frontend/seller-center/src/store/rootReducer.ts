import { combineReducers } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import productReducer from './slices/productSlice';
import orderReducer from './slices/orderSlice';
import inventoryReducer from './slices/inventorySlice';
import analyticsReducer from './slices/analyticsSlice';
import financeReducer from './slices/financeSlice';
import uiReducer from './slices/uiSlice';

export const rootReducer = combineReducers({
  auth: authReducer,
  product: productReducer,
  order: orderReducer,
  inventory: inventoryReducer,
  analytics: analyticsReducer,
  finance: financeReducer,
  ui: uiReducer,
});

export type RootState = ReturnType<typeof rootReducer>;

export default rootReducer;
