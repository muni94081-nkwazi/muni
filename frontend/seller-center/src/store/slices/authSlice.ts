import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { authApi, type SellerUser } from '../../api/auth.api';
import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, safeGetItem, safeRemoveItem, safeSetItem } from '@/utils/constants';

export const loginThunk = createAsyncThunk(
  'auth/login',
  async (credentials: { email: string; password: string }, { rejectWithValue }) => {
    try {
      return await authApi.login(credentials.email, credentials.password);
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.message || err.message || 'Login failed');
    }
  },
);

export const registerThunk = createAsyncThunk(
  'auth/register',
  async (
    input: { email: string; password: string; firstName: string; lastName: string; phoneNumber?: string },
    { rejectWithValue },
  ) => {
    try {
      return await authApi.register(input);
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.message || err.message || 'Registration failed');
    }
  },
);

export const logoutThunk = createAsyncThunk('auth/logout', async () => {
  await authApi.logout();
});

export const fetchCurrentUserThunk = createAsyncThunk(
  'auth/fetchCurrentUser',
  async (_, { rejectWithValue }) => {
    try {
      return await authApi.getCurrentUser();
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.message || err.message || 'Failed to fetch user');
    }
  },
);

interface AuthState {
  user: SellerUser | null;
  token: string | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: AuthState = {
  user: null,
  token: safeGetItem(ACCESS_TOKEN_KEY),
  status: 'idle',
  error: null,
};

export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearAuthError(state) {
      state.error = null;
    },
    /**
     * Adopt a session that was completed outside the login thunk.
     *
     * The second leg of a 2FA login exchanges a challenge token for the real
     * token pair, so the session arrives from /auth/2fa/authenticate rather
     * than /auth/login. Persisting it here keeps one place responsible for
     * writing the tokens.
     */
    sessionEstablished(state, action) {
      state.status = 'succeeded';
      state.error = null;
      state.user = action.payload.user;
      state.token = action.payload.accessToken;
      safeSetItem(ACCESS_TOKEN_KEY, action.payload.accessToken);
      if (action.payload.refreshToken) safeSetItem(REFRESH_TOKEN_KEY, action.payload.refreshToken);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loginThunk.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(loginThunk.fulfilled, (state, action) => {
        state.status = 'succeeded';

        // /auth/login does not always return a session. When the account needs
        // to enrol a second factor, or to answer one, the response carries a
        // short-lived challenge and no tokens — storing them blindly wrote
        // "undefined" over the token and user, which looked like a corrupted
        // login rather than a step still to complete. LoginPage routes those
        // statuses to the MFA pages; there is nothing to persist here.
        if (!action.payload.accessToken) return;

        state.user = action.payload.user;
        state.token = action.payload.accessToken;
        safeSetItem(ACCESS_TOKEN_KEY, action.payload.accessToken);
        // Without this the 15-minute access token had no way to be renewed:
        // auth-service returns a refresh token on login and the axios
        // interceptor needs it, but it was being discarded here.
        if (action.payload.refreshToken) safeSetItem(REFRESH_TOKEN_KEY, action.payload.refreshToken);
      })
      .addCase(loginThunk.rejected, (state, action) => {
        state.status = 'failed';
        state.error = (action.payload as string) ?? action.error.message ?? null;
      })
      .addCase(registerThunk.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(registerThunk.fulfilled, (state, action) => {
        state.status = 'succeeded';
        // Deliberately not auto-signing-in: the account is created, but the
        // seller application still needs review, so send them to /login instead.
      })
      .addCase(registerThunk.rejected, (state, action) => {
        state.status = 'failed';
        state.error = (action.payload as string) ?? action.error.message ?? null;
      })
      .addCase(fetchCurrentUserThunk.fulfilled, (state, action) => {
        state.user = action.payload;
      })
      .addCase(fetchCurrentUserThunk.rejected, (state) => {
        state.user = null;
        state.token = null;
        safeRemoveItem(ACCESS_TOKEN_KEY);
        safeRemoveItem(REFRESH_TOKEN_KEY);
      })
      .addCase(logoutThunk.fulfilled, (state) => {
        state.user = null;
        state.token = null;
        safeRemoveItem(ACCESS_TOKEN_KEY);
        safeRemoveItem(REFRESH_TOKEN_KEY);
      });
  },
});

export const { clearAuthError, sessionEstablished } = authSlice.actions;

export const selectUser = (state: any) => state.auth.user as SellerUser | null;
export const selectIsAuthenticated = (state: any) => !!state.auth.token;
export const selectAuthStatus = (state: any) => state.auth.status;
export const selectAuthError = (state: any) => state.auth.error as string | null;

export default authSlice.reducer;
