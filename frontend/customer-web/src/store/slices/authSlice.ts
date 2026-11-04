import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { authApi } from '@/api/auth.api';
import { cartApi } from '@/api/cart.api';
import type { LoginPayload, RegisterPayload, UpdateProfilePayload, User } from '@/types/user.types';
import { ACCESS_TOKEN_KEY, CART_SESSION_KEY, REFRESH_TOKEN_KEY } from '@/utils/constants';
import { errorMessage, safeGetItem, safeRemoveItem, safeSetItem } from '@/utils/helpers';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: AuthState = {
  user: null,
  isAuthenticated: Boolean(safeGetItem(ACCESS_TOKEN_KEY)),
  status: 'idle',
  error: null,
};

/**
 * After a successful login/register, merges whatever guest cart session
 * existed (if any) into the now-authenticated user's cart, then clears
 * the guest session id so future requests resolve by user id instead.
 * Best-effort: a merge failure shouldn't block the login itself.
 */
async function mergeGuestCartIfPresent(): Promise<void> {
  const guestSessionId = safeGetItem(CART_SESSION_KEY);
  if (!guestSessionId) return;

  try {
    await cartApi.mergeGuestCart(guestSessionId);
  } catch {
    // Non-fatal — the user simply keeps whatever was already in their
    // account cart; the guest items are lost rather than blocking login.
  } finally {
    safeRemoveItem(CART_SESSION_KEY);
  }
}

/**
 * What `login` resolves to. A pending second factor is not a failure — it is a
 * successful first leg that the caller has to route somewhere, so it comes back
 * as a value rather than a rejection.
 */
export type LoginOutcome =
  | { status: 'AUTHENTICATED'; user: User }
  | { status: 'MFA_REQUIRED'; challengeToken: string }
  | { status: 'MFA_ENROLLMENT_REQUIRED'; enrollmentToken: string };

export const login = createAsyncThunk<LoginOutcome, LoginPayload, { rejectValue: string }>(
  'auth/login',
  async (payload, { rejectWithValue }) => {
    try {
      const result = await authApi.login(payload);

      // Neither MFA branch carries tokens. Writing them anyway is what put the
      // string "undefined" nowhere and `isAuthenticated: true` everywhere.
      if (result.status === 'MFA_REQUIRED') {
        return { status: 'MFA_REQUIRED', challengeToken: result.challengeToken };
      }
      if (result.status === 'MFA_ENROLLMENT_REQUIRED') {
        return { status: 'MFA_ENROLLMENT_REQUIRED', enrollmentToken: result.enrollmentToken };
      }

      safeSetItem(ACCESS_TOKEN_KEY, result.accessToken);
      safeSetItem(REFRESH_TOKEN_KEY, result.refreshToken);
      await mergeGuestCartIfPresent();
      return { status: 'AUTHENTICATED', user: result.user };
    } catch (error) {
      return rejectWithValue(errorMessage(error, 'Could not sign in'));
    }
  },
);

/**
 * Completes an MFA login, or a social login, once tokens exist.
 *
 * Both arrive as tokens without a profile — 2fa/authenticate and /auth/exchange
 * each return only the session — so this stores them and then loads the user
 * the same way the password path does.
 */
export const establishSession = createAsyncThunk<
  User,
  { accessToken: string; refreshToken: string },
  { rejectValue: string }
>('auth/establishSession', async (tokens, { dispatch, rejectWithValue }) => {
  try {
    safeSetItem(ACCESS_TOKEN_KEY, tokens.accessToken);
    safeSetItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
    await mergeGuestCartIfPresent();

    // Awaited, not fired off: PrivateRoute reads `isAuthenticated`, which only
    // a fulfilled profile fetch sets. Navigating first lands on the guard while
    // this is still in flight and bounces straight back to /login.
    return await dispatch(fetchCurrentUser()).unwrap();
  } catch (error) {
    return rejectWithValue(errorMessage(error, 'Could not complete sign in'));
  }
});

export const register = createAsyncThunk('auth/register', async (payload: RegisterPayload, { rejectWithValue }) => {
  try {
    const response = await authApi.register(payload);
    safeSetItem(ACCESS_TOKEN_KEY, response.accessToken);
    safeSetItem(REFRESH_TOKEN_KEY, response.refreshToken);
    await mergeGuestCartIfPresent();
    return response.user;
  } catch (error) {
    return rejectWithValue(errorMessage(error, 'Could not create your account'));
  }
});

export const fetchCurrentUser = createAsyncThunk('auth/fetchCurrentUser', async (_, { rejectWithValue }) => {
  try {
    return await authApi.getCurrentUser();
  } catch (error) {
    return rejectWithValue(errorMessage(error, 'Could not load your profile'));
  }
});

export const updateProfile = createAsyncThunk(
  'auth/updateProfile',
  async (payload: UpdateProfilePayload, { rejectWithValue }) => {
    try {
      return await authApi.updateProfile(payload);
    } catch (error) {
      return rejectWithValue(errorMessage(error, 'Could not update your profile'));
    }
  },
);

export const logout = createAsyncThunk('auth/logout', async () => {
  try {
    await authApi.logout();
  } catch {
    // Even if the server call fails (e.g. token already expired),
    // we still want to clear local state below.
  }
  safeRemoveItem(ACCESS_TOKEN_KEY);
  safeRemoveItem(REFRESH_TOKEN_KEY);
});

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearAuthError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action: PayloadAction<LoginOutcome>) => {
        state.status = 'succeeded';
        // A pending second factor is not a session. Only the authenticated
        // branch may flip `isAuthenticated`, or PrivateRoute would admit a user
        // who is holding a challenge token and nothing else.
        if (action.payload.status === 'AUTHENTICATED') {
          state.user = action.payload.user;
          state.isAuthenticated = true;
        }
      })
      .addCase(login.rejected, (state, action) => {
        state.status = 'failed';
        state.error = (action.payload as string) ?? 'Could not sign in';
      })
      .addCase(register.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(register.fulfilled, (state, action: PayloadAction<User>) => {
        state.status = 'succeeded';
        state.user = action.payload;
        state.isAuthenticated = true;
      })
      .addCase(register.rejected, (state, action) => {
        state.status = 'failed';
        state.error = (action.payload as string) ?? 'Could not create your account';
      })
      .addCase(fetchCurrentUser.fulfilled, (state, action: PayloadAction<User>) => {
        state.user = action.payload;
        state.isAuthenticated = true;
      })
      .addCase(fetchCurrentUser.rejected, (state) => {
        state.user = null;
        state.isAuthenticated = false;
      })
      .addCase(updateProfile.fulfilled, (state, action: PayloadAction<User>) => {
        state.user = action.payload;
      })
      .addCase(establishSession.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(establishSession.fulfilled, (state, action: PayloadAction<User>) => {
        state.status = 'succeeded';
        state.user = action.payload;
        state.isAuthenticated = true;
      })
      .addCase(establishSession.rejected, (state, action) => {
        state.status = 'failed';
        state.error = (action.payload as string) ?? 'Could not complete sign in';
      })
      .addCase(logout.fulfilled, (state) => {
        state.user = null;
        state.isAuthenticated = false;
        state.status = 'idle';
      });
  },
});

export const { clearAuthError } = authSlice.actions;
export default authSlice.reducer;
