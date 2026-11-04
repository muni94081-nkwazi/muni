import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import { clearTokens, getRefreshToken, getTokens, saveTokens } from '@/api/tokenStorage';
import { authApi, type AuthSession } from '@/api/auth.api';
import { registerPushToken } from '@/notifications/push';
import { logger } from '@/utils/logger';
import type { AuthTokens, User } from '@/types';
import type { RootState } from './index';

// `User` is defined once, in src/types. This slice used to declare a second,
// subtly different copy (roles as `string[]`, no `emailVerified`), which meant
// the API layer and the screens were typed against different shapes of the same
// object. Re-exported here so existing `from '@/store/auth.slice'` imports keep
// resolving.
export type { User };

export interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  isLoading: boolean;
  /**
   * True once session restoration has settled — on EITHER path.
   *
   * Without this there is no way to tell "no session" from "session not
   * restored yet": both read as `accessToken === null`. Any guard evaluating
   * during startup would treat a logged-in user as signed out and redirect
   * them to login, which is precisely the bug that made stored sessions look
   * like they were never persisted.
   *
   * Deliberately NOT reset by logout or clearAuth. It describes whether
   * restoration has run this process, not whether anyone is signed in —
   * clearing it would strand the app on the splash screen forever.
   */
  hasBootstrapped: boolean;
  error: string | null;
}

const initialState: AuthState = {
  accessToken: null,
  refreshToken: null,
  user: null,
  isLoading: false,
  hasBootstrapped: false,
  error: null,
};

/**
 * Rehydrates the session from SecureStore on app start.
 *
 * Restores BOTH halves of a session: the tokens, and the user object the
 * tokens belong to. Tokens alone are not enough — every role check reads
 * `user.roles`, so a token-only restore leaves a real seller looking like a
 * signed-out stranger to `app/seller/_layout.tsx` after each cold start.
 *
 * The profile fetch is deliberately non-fatal. A network blip, a slow cold
 * start or a transient 5xx must not cost the user a session that is otherwise
 * perfectly valid, so a failure here returns `user: null` and keeps the
 * tokens. The genuinely-dead-session case is already handled elsewhere: the
 * 401 interceptor in `src/api/client.ts` refreshes, and ends the session only
 * when the refresh itself fails.
 */
export const loadStoredAuthThunk = createAsyncThunk<
  { tokens: AuthTokens; user: User | null },
  void,
  { rejectValue: string }
>('auth/loadStoredAuth', async (_arg, { rejectWithValue }) => {
  let tokens: AuthTokens | null;

  try {
    tokens = await getTokens();
  } catch (err) {
    return rejectWithValue(err instanceof Error ? err.message : 'Failed to read stored tokens');
  }

  // The ordinary first-run case, not an error condition. Rejecting here still
  // marks the bootstrap complete (see extraReducers) so startup proceeds.
  if (!tokens) return rejectWithValue('No tokens stored');

  let user: User | null = null;
  try {
    user = await authApi.getProfile();
  } catch (err) {
    logger.warn('[auth] Session restored without a profile — roles unavailable until refetched:', err);
  }

  return { tokens, user };
});

/**
 * The single place a new session lands.
 *
 * Both login legs end here — the direct AUTHENTICATED response and the
 * post-2FA one — so tokens, the user object and (below) push registration are
 * wired once instead of being duplicated per screen and drifting.
 *
 * Tokens are written to SecureStore BEFORE Redux. The tab layout renders as
 * soon as `accessToken` lands in Redux, and its first data fetch reads the
 * token back out of SecureStore via the request interceptor — ordering it the
 * other way leaves a window where the app is "logged in" but every request goes
 * out unauthenticated.
 */
export const establishSessionThunk = createAsyncThunk<
  { tokens: AuthTokens; user: User },
  AuthSession,
  { rejectValue: string }
>('auth/establishSession', async (session, { rejectWithValue }) => {
  const tokens: AuthTokens = {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
  };

  try {
    await saveTokens(tokens);
  } catch (err) {
    return rejectWithValue(err instanceof Error ? err.message : 'Failed to store tokens');
  }

  // Push registration is fire-and-forget and intentionally NOT awaited: it
  // prompts for OS permission on first run, and blocking the login on that
  // dialog would leave the user staring at a spinner behind it. It also cannot
  // fail the login — registerPushToken swallows its own errors.
  //
  // Runs on every login rather than once, because FCM rotates tokens and a
  // shared device can change hands; the service upserts on the token and
  // re-points it at the account signing in now.
  void registerPushToken();

  // No guest-cart merge is performed here, deliberately. Mobile carts are
  // already user-scoped — the app cannot produce a guest cart at all — so
  // there is nothing to fold in. The full reasoning, and the shared-device
  // case that DID need fixing, are in cart.slice.ts.

  return { tokens, user: session.user };
});

/** Persists tokens to SecureStore and puts them in Redux in one step. */
export const persistTokensThunk = createAsyncThunk<
  AuthTokens,
  AuthTokens,
  { rejectValue: string }
>('auth/persistTokens', async (tokens, { rejectWithValue }) => {
  try {
    await saveTokens(tokens);
    return tokens;
  } catch (err) {
    return rejectWithValue(err instanceof Error ? err.message : 'Failed to store tokens');
  }
});

/**
 * Signs the user out: on the server first, then the device, then Redux.
 *
 * Three things have to happen, and until now only the last two did.
 *
 * `clearTokens()` ends the session on THIS device — without it the request
 * interceptor keeps attaching a stale Bearer token to the next signed-out
 * request. But the refresh token remains valid server-side for its full 30
 * days, so a copy captured before sign-out still buys a working session. Only
 * POST /auth/logout revokes the family, and nothing was calling it.
 *
 * The server call is best-effort and deliberately never throws: a shopper on a
 * dead connection, or one whose token has already expired, must still be able
 * to sign out of their own device. Local state is cleared either way — which is
 * why the revoke goes first, while the token that authorises it still exists.
 */
export const logoutThunk = createAsyncThunk<void, void>('auth/logout', async () => {
  try {
    const refreshToken = await getRefreshToken();
    if (refreshToken) await authApi.logout(refreshToken);
  } catch (err) {
    logger.warn('[auth] Server-side logout failed; clearing this device anyway:', err);
  }

  await clearTokens();
});

export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearError(state) {
      state.error = null;
    },
    setUser(state, action: PayloadAction<User>) {
      state.user = action.payload;
    },
    clearAuth(state) {
      state.accessToken = null;
      state.refreshToken = null;
      state.user = null;
      state.error = null;
    },
    setTokens(state, action: PayloadAction<AuthTokens>) {
      state.accessToken = action.payload.accessToken;
      state.refreshToken = action.payload.refreshToken;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadStoredAuthThunk.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(loadStoredAuthThunk.fulfilled, (state, action) => {
        state.isLoading = false;
        state.accessToken = action.payload.tokens.accessToken;
        state.refreshToken = action.payload.tokens.refreshToken;
        // Null when the profile fetch failed. The tokens are still good, so the
        // session stands and `user` can be refetched later.
        state.user = action.payload.user;
        state.hasBootstrapped = true;
      })
      // Covers both "nothing stored" (the normal first run) and a SecureStore
      // read error. Either way restoration has finished, and startup must not
      // wait on it any longer — omitting this is what would hang the splash.
      .addCase(loadStoredAuthThunk.rejected, (state) => {
        state.isLoading = false;
        state.hasBootstrapped = true;
      })
      .addCase(establishSessionThunk.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(establishSessionThunk.fulfilled, (state, action) => {
        state.isLoading = false;
        state.accessToken = action.payload.tokens.accessToken;
        state.refreshToken = action.payload.tokens.refreshToken;
        state.user = action.payload.user;
        state.error = null;
      })
      .addCase(establishSessionThunk.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? 'Could not start session';
      })
      .addCase(persistTokensThunk.fulfilled, (state, action) => {
        state.accessToken = action.payload.accessToken;
        state.refreshToken = action.payload.refreshToken;
        state.error = null;
      })
      .addCase(persistTokensThunk.rejected, (state, action) => {
        state.error = action.payload ?? 'Failed to store tokens';
      })
      .addCase(logoutThunk.fulfilled, (state) => {
        state.accessToken = null;
        state.refreshToken = null;
        state.user = null;
        state.error = null;
      });
  },
});

export const { clearError, setUser, clearAuth, setTokens } = authSlice.actions;

export const selectIsAuthenticated = (state: RootState): boolean => !!state.auth.accessToken;
export const selectUser = (state: RootState): User | null => state.auth.user;
export const selectAuthLoading = (state: RootState): boolean => state.auth.isLoading;
/**
 * Whether session restoration has finished. Guards must wait on this before
 * reading `accessToken`, or they will act on a session that is still loading.
 */
export const selectHasBootstrapped = (state: RootState): boolean => state.auth.hasBootstrapped;

export default authSlice.reducer;
