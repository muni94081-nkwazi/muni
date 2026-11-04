/**
 * Phase 1 — session restoration and the bootstrap/interceptor race.
 *
 * Two things are locked down here:
 *
 *   1. The bootstrap state machine. `hasBootstrapped` must settle on EVERY
 *      path, or the app hangs on the splash screen; and a failed profile fetch
 *      must never cost the user a session whose tokens are still good.
 *
 *   2. That `endSession` does not navigate before the root navigator exists.
 *      Session restoration issues a request during startup, while AppRoot is
 *      deliberately withholding the navigation tree — so a stored session with
 *      a dead refresh token used to reach `router.replace` with nothing mounted
 *      to receive it.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), push: jest.fn() } }));

const mockGetTokens = jest.fn();
const mockClearTokens = jest.fn(async () => undefined);
const mockGetAccessToken = jest.fn(async () => 'stored-access');
const mockGetRefreshToken = jest.fn(async () => null as string | null);

jest.mock('@/api/tokenStorage', () => ({
  getTokens: () => mockGetTokens(),
  clearTokens: () => mockClearTokens(),
  saveTokens: jest.fn(async () => undefined),
  getAccessToken: () => mockGetAccessToken(),
  getRefreshToken: () => mockGetRefreshToken(),
}));

const mockGetProfile = jest.fn();
jest.mock('@/api/auth.api', () => ({
  authApi: { getProfile: () => mockGetProfile() },
}));

// Imported by auth.slice for the login path; irrelevant here and must not
// reach the real expo-notifications module.
jest.mock('@/notifications/push', () => ({ registerPushToken: jest.fn() }));

import { configureStore } from '@reduxjs/toolkit';
import { router } from 'expo-router';
import authReducer, {
  loadStoredAuthThunk,
  logoutThunk,
  clearAuth,
  selectHasBootstrapped,
} from '../auth.slice';

const TOKENS = { accessToken: 'access-1', refreshToken: 'refresh-1' };
const USER = {
  id: 'u-1',
  email: 'shopper@muni.ug',
  firstName: 'Ada',
  lastName: 'Nakato',
  roles: ['ROLE_SELLER'],
};

function makeStore() {
  return configureStore({ reducer: { auth: authReducer } });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetRefreshToken.mockResolvedValue(null);
});

// ── A. No stored session ──────────────────────────────────────────────────────

describe('A · no stored session', () => {
  it('completes bootstrap and stays signed out', async () => {
    mockGetTokens.mockResolvedValue(null);
    const store = makeStore();

    expect(selectHasBootstrapped(store.getState() as never)).toBe(false);

    await store.dispatch(loadStoredAuthThunk());

    const { auth } = store.getState();
    // The rejected path. Bootstrap must still settle — this is the ordinary
    // first-run case, and leaving it false strands the app on the splash.
    expect(auth.hasBootstrapped).toBe(true);
    expect(auth.accessToken).toBeNull();
    expect(auth.user).toBeNull();
    expect(mockGetProfile).not.toHaveBeenCalled();
  });

  it('completes bootstrap even when reading storage throws', async () => {
    mockGetTokens.mockRejectedValue(new Error('SecureStore unavailable'));
    const store = makeStore();

    await store.dispatch(loadStoredAuthThunk());

    expect(store.getState().auth.hasBootstrapped).toBe(true);
    expect(store.getState().auth.accessToken).toBeNull();
  });
});

// ── B. Valid stored session ───────────────────────────────────────────────────

describe('B · valid stored session', () => {
  it('restores tokens, profile and roles', async () => {
    mockGetTokens.mockResolvedValue(TOKENS);
    mockGetProfile.mockResolvedValue(USER);
    const store = makeStore();

    await store.dispatch(loadStoredAuthThunk());

    const { auth } = store.getState();
    expect(auth.accessToken).toBe('access-1');
    expect(auth.refreshToken).toBe('refresh-1');
    expect(mockGetProfile).toHaveBeenCalledTimes(1);
    expect(auth.user).toEqual(USER);
    // The role gate in app/seller/_layout.tsx reads exactly this.
    expect(auth.user?.roles).toContain('ROLE_SELLER');
    expect(auth.hasBootstrapped).toBe(true);
  });
});

// ── C. Profile unavailable ────────────────────────────────────────────────────

describe('C · profile fetch fails', () => {
  it('keeps the tokens and does not clear the session', async () => {
    mockGetTokens.mockResolvedValue(TOKENS);
    mockGetProfile.mockRejectedValue(new Error('Network request failed'));
    const store = makeStore();

    await store.dispatch(loadStoredAuthThunk());

    const { auth } = store.getState();
    // The whole point: a transient profile failure must not cost a session
    // whose tokens are perfectly valid.
    expect(auth.accessToken).toBe('access-1');
    expect(auth.refreshToken).toBe('refresh-1');
    expect(auth.user).toBeNull();
    expect(auth.hasBootstrapped).toBe(true);
    expect(mockClearTokens).not.toHaveBeenCalled();
  });

  it('is distinguishable from the signed-out state', async () => {
    mockGetTokens.mockResolvedValue(TOKENS);
    mockGetProfile.mockRejectedValue(new Error('502'));
    const store = makeStore();

    await store.dispatch(loadStoredAuthThunk());

    const { auth } = store.getState();
    // "Bootstrapped, token present, no profile" is its own state and must not
    // read as "bootstrapped, signed out".
    expect(auth.hasBootstrapped && auth.accessToken !== null && auth.user === null).toBe(true);
  });
});

// ── E. Logout ─────────────────────────────────────────────────────────────────

describe('E · logout and clearAuth', () => {
  it('signs out without rewinding the bootstrap flag', async () => {
    mockGetTokens.mockResolvedValue(TOKENS);
    mockGetProfile.mockResolvedValue(USER);
    const store = makeStore();

    await store.dispatch(loadStoredAuthThunk());
    await store.dispatch(logoutThunk());

    const { auth } = store.getState();
    expect(auth.accessToken).toBeNull();
    expect(auth.user).toBeNull();
    // Bootstrap describes whether restoration ran this process, not who is
    // signed in. Resetting it here would send the app back to the splash.
    expect(auth.hasBootstrapped).toBe(true);
  });

  it('keeps the bootstrap flag through clearAuth (the session-expiry path)', async () => {
    mockGetTokens.mockResolvedValue(TOKENS);
    mockGetProfile.mockResolvedValue(USER);
    const store = makeStore();

    await store.dispatch(loadStoredAuthThunk());
    store.dispatch(clearAuth());

    expect(store.getState().auth.accessToken).toBeNull();
    expect(store.getState().auth.hasBootstrapped).toBe(true);
  });
});

// ── D. Expired session during bootstrap ───────────────────────────────────────
//
// Drives the real response interceptor. A 401 with no usable refresh token is
// the exact shape of "stored session is dead", which is what restoration hits
// on a cold start.

describe('D · expired session, navigator not yet mounted', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  function loadClient() {
    let mod: typeof import('../../api/client');
    jest.isolateModules(() => {
      mod = require('../../api/client');
    });
    return mod!;
  }

  function forceUnauthorized(client: { apiClient: { defaults: Record<string, unknown> } }) {
    client.apiClient.defaults.adapter = async (config: unknown) => {
      throw Object.assign(new Error('Request failed with status code 401'), {
        config,
        isAxiosError: true,
        response: { status: 401, data: {}, headers: {}, config },
      });
    };
  }

  it('does not navigate while the navigation tree is absent', async () => {
    const client = loadClient();
    forceUnauthorized(client as never);
    // Default state: AppRoot has not mounted the Stack yet.

    await expect(client.apiClient.get('/api/v1/users/me')).rejects.toBeDefined();

    // The session still ends — tokens are wiped — but nothing navigates.
    expect(mockClearTokens).toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('navigates once the navigator is ready (behaviour after startup)', async () => {
    const client = loadClient();
    forceUnauthorized(client as never);
    client.setNavigationReady(true);

    await expect(client.apiClient.get('/api/v1/users/me')).rejects.toBeDefined();

    expect(mockClearTokens).toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/(auth)/login');
    // Exactly once — a repeated replace is what a redirect loop looks like.
    expect(router.replace).toHaveBeenCalledTimes(1);
  });

  it('ends the session on both paths, so an invalid session cannot persist', async () => {
    const client = loadClient();
    forceUnauthorized(client as never);

    await expect(client.apiClient.get('/api/v1/users/me')).rejects.toBeDefined();

    // Requirement: suppressing the navigate must not weaken sign-out. Redux is
    // reset via the session-expired event, and the tab guard handles the
    // redirect on its first render.
    expect(mockClearTokens).toHaveBeenCalledTimes(1);
  });
});
