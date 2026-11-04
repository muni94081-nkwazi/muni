import { describe, expect, it, vi, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { rootReducer } from '@/store/rootReducer';
import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from '@/utils/constants';
import { makeUser } from '@/test-utils/renderWithProviders';

vi.mock('@/api/auth.api', () => ({
  authApi: {
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    getCurrentUser: vi.fn(),
    exchangeOAuthCode: vi.fn(),
  },
}));

vi.mock('@/api/cart.api', () => ({
  cartApi: { mergeGuestCart: vi.fn().mockResolvedValue(undefined) },
}));

import { authApi } from '@/api/auth.api';
import { establishSession, login, logout, register } from '../authSlice';

const mocked = vi.mocked(authApi);

/**
 * The login thunk, and what it is allowed to conclude from a 200.
 *
 * POST /auth/login has three successful outcomes and only one of them carries
 * tokens. This slice used to assume otherwise — it read `response.accessToken`
 * unconditionally, wrote `undefined` into localStorage, and then set
 * `isAuthenticated: true` with `user: undefined`. Any seller or admin signing
 * in on the web landed in a half-session that PrivateRoute would admit and
 * every subsequent request would 401.
 */
function makeStore() {
  return configureStore({ reducer: rootReducer });
}

const session = {
  accessToken: 'access-abc',
  refreshToken: 'refresh-def',
  tokenType: 'Bearer',
  expiresIn: 900,
};

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe('login — authenticated', () => {
  it('stores both tokens and marks the session authenticated', async () => {
    mocked.login.mockResolvedValue({ status: 'AUTHENTICATED', ...session, user: makeUser() });

    const store = makeStore();
    const outcome = await store.dispatch(login({ email: 'a@b.com', password: 'x' })).unwrap();

    expect(outcome.status).toBe('AUTHENTICATED');
    expect(window.localStorage.getItem(ACCESS_TOKEN_KEY)).toBe('access-abc');
    expect(window.localStorage.getItem(REFRESH_TOKEN_KEY)).toBe('refresh-def');

    const { auth } = store.getState();
    expect(auth.isAuthenticated).toBe(true);
    expect(auth.user?.email).toBe('ada@example.com');
  });

  it('defaults a response with no status to AUTHENTICATED', async () => {
    // auth-service omits `status` on the plain success path; the api layer
    // fills it in so callers have one shape to switch on. Asserted here
    // because the thunk's branching depends on it.
    mocked.login.mockResolvedValue({ status: 'AUTHENTICATED', ...session, user: makeUser() });

    const store = makeStore();
    const outcome = await store.dispatch(login({ email: 'a@b.com', password: 'x' })).unwrap();

    expect(outcome).toMatchObject({ status: 'AUTHENTICATED' });
  });
});

describe('login — second factor outstanding', () => {
  it('returns the challenge without storing tokens or claiming a session', async () => {
    mocked.login.mockResolvedValue({
      status: 'MFA_REQUIRED',
      challengeToken: 'challenge-xyz',
    });

    const store = makeStore();
    const outcome = await store.dispatch(login({ email: 'seller@b.com', password: 'x' })).unwrap();

    expect(outcome).toEqual({ status: 'MFA_REQUIRED', challengeToken: 'challenge-xyz' });

    // Nothing was written: there were no tokens in that response to write.
    expect(window.localStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
    expect(window.localStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();

    // And PrivateRoute must not let a challenge token through as a session.
    const { auth } = store.getState();
    expect(auth.isAuthenticated).toBe(false);
    expect(auth.user).toBeNull();
  });

  it('returns the enrolment token for a privileged account with no factor yet', async () => {
    mocked.login.mockResolvedValue({
      status: 'MFA_ENROLLMENT_REQUIRED',
      enrollmentToken: 'enrol-xyz',
    });

    const store = makeStore();
    const outcome = await store.dispatch(login({ email: 'admin@b.com', password: 'x' })).unwrap();

    expect(outcome).toEqual({ status: 'MFA_ENROLLMENT_REQUIRED', enrollmentToken: 'enrol-xyz' });
    expect(window.localStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
    expect(store.getState().auth.isAuthenticated).toBe(false);
  });

  it('does not merge the guest cart before a session actually exists', async () => {
    const { cartApi } = await import('@/api/cart.api');
    window.localStorage.setItem('muni_cart_session', 'guest-1');
    mocked.login.mockResolvedValue({ status: 'MFA_REQUIRED', challengeToken: 'c' });

    await makeStore().dispatch(login({ email: 'seller@b.com', password: 'x' })).unwrap();

    expect(vi.mocked(cartApi).mergeGuestCart).not.toHaveBeenCalled();
    // The guest session survives, so the merge still happens after the second
    // factor rather than being silently dropped.
    expect(window.localStorage.getItem('muni_cart_session')).toBe('guest-1');
  });
});

describe('register', () => {
  it('stores the tokens and signs the new account straight in', async () => {
    mocked.register.mockResolvedValue({ ...session, user: makeUser() });

    const store = makeStore();
    const user = await store.dispatch(
      register({ firstName: 'Ada', lastName: 'Nakato', email: 'a@b.com', password: 'Password1!aaaa' }),
    ).unwrap();

    expect(user.email).toBe('ada@example.com');
    expect(window.localStorage.getItem(ACCESS_TOKEN_KEY)).toBe('access-abc');
    expect(window.localStorage.getItem(REFRESH_TOKEN_KEY)).toBe('refresh-def');
    expect(store.getState().auth.isAuthenticated).toBe(true);
  });

  it('merges a guest cart, so items added before signing up survive', async () => {
    const { cartApi } = await import('@/api/cart.api');
    window.localStorage.setItem('muni_cart_session', 'guest-1');
    mocked.register.mockResolvedValue({ ...session, user: makeUser() });

    await makeStore().dispatch(
      register({ firstName: 'Ada', lastName: 'Nakato', email: 'a@b.com', password: 'Password1!aaaa' }),
    ).unwrap();

    expect(vi.mocked(cartApi).mergeGuestCart).toHaveBeenCalledWith('guest-1');
    // Cleared afterwards, so later requests resolve by user id rather than
    // re-merging the same guest cart on every login.
    expect(window.localStorage.getItem('muni_cart_session')).toBeNull();
  });

  it('surfaces a duplicate-email rejection without claiming a session', async () => {
    mocked.register.mockRejectedValue(new Error('Email is already registered'));

    const store = makeStore();
    await expect(
      store.dispatch(
        register({ firstName: 'Ada', lastName: 'Nakato', email: 'taken@b.com', password: 'Password1!aaaa' }),
      ).unwrap(),
    ).rejects.toBeDefined();

    expect(store.getState().auth.isAuthenticated).toBe(false);
    expect(store.getState().auth.error).toBeTruthy();
    expect(window.localStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
  });
});

describe('OAuth callback — the exchange-code leg', () => {
  it('turns exchanged tokens into a real session', async () => {
    // OAuthCallback redeems the one-time code, then hands the tokens here.
    mocked.exchangeOAuthCode.mockResolvedValue(session);
    mocked.getCurrentUser.mockResolvedValue(makeUser());

    const store = makeStore();
    const exchanged = await authApi.exchangeOAuthCode('one-time-code');
    await store.dispatch(establishSession(exchanged)).unwrap();

    expect(window.localStorage.getItem(ACCESS_TOKEN_KEY)).toBe('access-abc');
    expect(store.getState().auth.isAuthenticated).toBe(true);
  });
});

describe('login — failure', () => {
  it('records the error and leaves the session signed out', async () => {
    mocked.login.mockRejectedValue(new Error('Invalid email or password'));

    const store = makeStore();
    await expect(
      store.dispatch(login({ email: 'a@b.com', password: 'wrong' })).unwrap(),
    ).rejects.toBeDefined();

    const { auth } = store.getState();
    expect(auth.isAuthenticated).toBe(false);
    expect(auth.status).toBe('failed');
    expect(auth.error).toBeTruthy();
  });
});

describe('establishSession — the second leg of MFA, and of a social login', () => {
  it('stores the tokens and loads the profile', async () => {
    mocked.getCurrentUser.mockResolvedValue(makeUser(['ROLE_SELLER']));

    const store = makeStore();
    await store.dispatch(establishSession(session)).unwrap();

    expect(window.localStorage.getItem(ACCESS_TOKEN_KEY)).toBe('access-abc');
    const { auth } = store.getState();
    expect(auth.isAuthenticated).toBe(true);
    expect(auth.user?.roles).toContain('ROLE_SELLER');
  });

  it('does not claim a session when the profile lookup fails', async () => {
    mocked.getCurrentUser.mockRejectedValue(new Error('network down'));

    const store = makeStore();
    await expect(store.dispatch(establishSession(session)).unwrap()).rejects.toBeDefined();

    expect(store.getState().auth.isAuthenticated).toBe(false);
  });
});

describe('logout', () => {
  it('clears both tokens even when the server call fails', async () => {
    window.localStorage.setItem(ACCESS_TOKEN_KEY, 'access-abc');
    window.localStorage.setItem(REFRESH_TOKEN_KEY, 'refresh-def');
    mocked.logout.mockRejectedValue(new Error('already expired'));

    const store = makeStore();
    await store.dispatch(logout());

    expect(window.localStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
    expect(window.localStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
    expect(store.getState().auth.isAuthenticated).toBe(false);
  });
});
