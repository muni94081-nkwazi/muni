import { combineReducers } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import productReducer from './slices/productSlice';
import cartReducer from './slices/cartSlice';
import orderReducer from './slices/orderSlice';
import uiReducer from './slices/uiSlice';
import currencyReducer from './slices/currencySlice';

export const rootReducer = combineReducers({
  auth: authReducer,
  products: productReducer,
  cart: cartReducer,
  orders: orderReducer,
  ui: uiReducer,
  currency: currencyReducer,
});

export type RootState = ReturnType<typeof rootReducer>;
