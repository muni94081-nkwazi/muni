import { combineReducers } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import userReducer from './slices/userSlice';
import productReducer from './slices/productSlice';
import orderReducer from './slices/orderSlice';
import categoryReducer from './slices/categorySlice';
import disputeReducer from './slices/disputeSlice';
import uiReducer from './slices/uiSlice';
import buyerProtectionReducer from './slices/buyerProtectionSlice';
import containerReducer from './slices/containerSlice';
import dashboardReducer from './slices/dashboardSlice';
import financeReducer from './slices/financeSlice';
import healthReducer from './slices/healthSlice';
import rbacReducer from './slices/rbacSlice';
import verificationReducer from './slices/verificationSlice';

export const rootReducer = combineReducers({
  auth: authReducer,
  users: userReducer,
  products: productReducer,
  orders: orderReducer,
  categories: categoryReducer,
  disputes: disputeReducer,
  ui: uiReducer,
  buyerProtection: buyerProtectionReducer,
  containers: containerReducer,
  dashboard: dashboardReducer,
  finance: financeReducer,
  health: healthReducer,
  rbac: rbacReducer,
  verification: verificationReducer,
});

export type RootState = ReturnType<typeof rootReducer>;
