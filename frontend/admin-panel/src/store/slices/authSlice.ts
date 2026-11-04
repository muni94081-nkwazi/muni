import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { authApi } from '@/api/auth.api';
import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from '@/api/axios.config';
import type { AuthenticatedAdmin, LoginPayload } from '@/types/user.types';

interface AuthState {
  user: AuthenticatedAdmin | null;
  token: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
}

const initialState: AuthState = {
  user: null,
  token: localStorage.getItem(ACCESS_TOKEN_KEY),
  isAuthenticated: !!localStorage.getItem(ACCESS_TOKEN_KEY),
  loading: false,
  error: null,
};

export const loginThunk = createAsyncThunk(
  'auth/login',
  async (payload: LoginPayload, { rejectWithValue }) => {
    try {
      const response = await authApi.login(payload);
      localStorage.setItem(ACCESS_TOKEN_KEY, response.accessToken);
      // auth-service returns a refresh token alongside the access token; it was
      // being discarded, leaving the 15-minute access token unrenewable.
      if (response.refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, response.refreshToken);
      return response;
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.message || err.message || 'Login failed');
    }
  }
);

export const fetchUserThunk = createAsyncThunk(
  'auth/fetchUser',
  async (_, { rejectWithValue }) => {
    try {
      return await authApi.getCurrentUser();
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.message || err.message || 'Failed to fetch user');
    }
  }
);

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout(state) {
      state.user = null;
      state.token = null;
      state.isAuthenticated = false;
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(loginThunk.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loginThunk.fulfilled, (state, action) => {
        state.loading = false;
        state.isAuthenticated = true;
        state.token = action.payload.accessToken;
        state.user = action.payload.user;
      })
      .addCase(loginThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(fetchUserThunk.fulfilled, (state, action) => {
        state.user = action.payload;
        state.isAuthenticated = true;
      })
      .addCase(fetchUserThunk.rejected, (state) => {
        state.user = null;
        state.isAuthenticated = false;
        state.token = null;
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
      });
  }
});

export const logoutThunk = createAsyncThunk('auth/logoutThunk', async (_, { dispatch }) => {
  try {
    await authApi.logout();
  } catch {
    // Even if the server call fails (token already expired, etc.), still clear local state.
  }
  dispatch(authSlice.actions.logout());
});

export const { logout } = authSlice.actions;
export default authSlice.reducer;
