/**
 * auth.session.test.ts
 *
 * How a session gets onto the device, from both directions.
 *
 *   establishSessionThunk — the password and 2FA logins land here
 *   persistTokensThunk    — the social login lands here, tokens first
 *
 * Both were untested, and both have an ordering constraint that is invisible
 * from the outside: SecureStore is written BEFORE Redux. The tab layout renders
 * the moment `accessToken` appears in Redux, and its first data fetch reads the
 * token back out of SecureStore via the request interceptor — so writing Redux
 * first leaves a window where the app is "logged in" and every request goes out
 * unauthenticated. Asserting the write happened is not enough; the assertions
 * below check it happened first.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const mockSaveTokens = jest.fn(async (_tokens?: unknown) => undefined);
const mockClearTokens = jest.fn(async () => undefined);
const mockGetTokens = jest.fn(async () => null as { accessToken: string; refreshToken: string } | null);
const mockGetRefreshToken = jest.fn(async () => null as string | null);

jest.mock('@/api/tokenStorage', () => ({
  saveTokens: (...args: unknown[]) => mockSaveTokens(...(args as [])),
  clearTokens: () => mockClearTokens(),
  getTokens: () => mockGetTokens(),
  getRefreshToken: () => mockGetRefreshToken(),
  getAccessToken: jest.fn(async () => null),
}));

const mockGetProfile = jest.fn();
const mockLogout = jest.fn(async (_token?: string) => undefined);
jest.mock('@/api/auth.api', () => ({
  authApi: {
    getProfile: () => mockGetProfile(),
    logout: (t: string) => mockLogout(t),
  },
}));

// Push registration prompts for OS permission on first run; it is fire-and-
// forget in the thunk and must not be awaited or allowed to fail a login.
const mockRegisterPush = jest.fn();
jest.mock('@/notifications/push', () => ({ registerPushToken: () => mockRegisterPush() }));

jest.mock('expo-router', () => ({ router: { replace: jest.fn(), push: jest.fn() } }));

import { configureStore } from '@reduxjs/toolkit';
import authReducer, {
  establishSessionThunk,
  persistTokensThunk,
  loadStoredAuthThunk,
  logoutThunk,
} from '../auth.slice';
import type { User } from '@/types';

const USER = {
  id: 'user-1',
  email: 'ada@muni.ug',
  firstName: 'Ada',
  lastName: 'Nakato',
  roles: ['ROLE_SELLER'],
} as unknown as User;

const SESSION = {
  accessToken: 'access-abc',
  refreshToken: 'refresh-def',
  tokenType: 'Bearer',
  expiresIn: 900,
  user: USER,
};

function makeStore() {
  return configureStore({ reducer: { auth: authReducer } });
}

beforeEach(() => {
  // clearAllMocks() resets call history but NOT implementations, so a
  // mockRejectedValue set by one test leaks into every test after it. Each
  // default is re-established explicitly rather than relying on that.
  jest.clearAllMocks();
  mockSaveTokens.mockResolvedValue(undefined);
  mockClearTokens.mockResolvedValue(undefined);
  mockGetTokens.mockResolvedValue(null);
  mockGetRefreshToken.mockResolvedValue(null);
  mockLogout.mockResolvedValue(undefined);
  mockRegisterPush.mockReturnValue(undefined);
  mockGetProfile.mockResolvedValue(USER);
});

describe('establishSessionThunk', () => {
  it('writes both tokens to SecureStore', async () => {
    const store = makeStore();
    await store.dispatch(establishSessionThunk(SESSION)).unwrap();

    expect(mockSaveTokens).toHaveBeenCalledWith({
      accessToken: 'access-abc',
      refreshToken: 'refresh-def',
    });
  });

  it('puts the tokens and the user into Redux', async () => {
    const store = makeStore();
    await store.dispatch(establishSessionThunk(SESSION)).unwrap();

    const { auth } = store.getState();
    expect(auth.accessToken).toBe('access-abc');
    expect(auth.refreshToken).toBe('refresh-def');
    expect(auth.user?.id).toBe('user-1');
    // Roles come from the session, not a second fetch — the seller layout reads
    // them immediately after login.
    expect(auth.user?.roles).toContain('ROLE_SELLER');
  });

  it('writes SecureStore BEFORE Redux', async () => {
    // The ordering constraint. Reversed, the tab layout mounts and fires its
    // first request before the interceptor can find a token to attach.
    let reduxHadTokenWhenSaved: boolean | null = null;
    const store = makeStore();
    mockSaveTokens.mockImplementation(async () => {
      reduxHadTokenWhenSaved = store.getState().auth.accessToken !== null;
      return undefined;
    });

    await store.dispatch(establishSessionThunk(SESSION)).unwrap();

    expect(reduxHadTokenWhenSaved).toBe(false);
    expect(store.getState().auth.accessToken).toBe('access-abc');
  });

  it('registers for push without awaiting it', async () => {
    // Awaiting would block the login behind an OS permission dialog.
    mockRegisterPush.mockImplementation(() => new Promise(() => { /* never settles */ }));

    const store = makeStore();
    await expect(store.dispatch(establishSessionThunk(SESSION)).unwrap()).resolves.toBeDefined();
    expect(mockRegisterPush).toHaveBeenCalled();
  });

  it('rejects, and claims no session, when SecureStore write fails', async () => {
    mockSaveTokens.mockRejectedValue(new Error('keychain unavailable'));

    const store = makeStore();
    await expect(store.dispatch(establishSessionThunk(SESSION)).unwrap()).rejects.toBeDefined();

    const { auth } = store.getState();
    expect(auth.accessToken).toBeNull();
    expect(auth.error).toBeTruthy();
  });
});

describe('persistTokensThunk — where a social login lands', () => {
  it('persists the exchanged tokens and puts them in Redux', async () => {
    const store = makeStore();
    await store.dispatch(
      persistTokensThunk({ accessToken: 'oauth-access', refreshToken: 'oauth-refresh' }),
    ).unwrap();

    expect(mockSaveTokens).toHaveBeenCalledWith({
      accessToken: 'oauth-access',
      refreshToken: 'oauth-refresh',
    });
    const { auth } = store.getState();
    expect(auth.accessToken).toBe('oauth-access');
    expect(auth.refreshToken).toBe('oauth-refresh');
  });

  it('leaves the user null — the profile is a separate step', async () => {
    // SocialSignIn follows this with loadStoredAuthThunk, which is what fetches
    // the profile the role checks need. Asserting the split keeps the two from
    // being collapsed into one thunk that half-populates state.
    const store = makeStore();
    await store.dispatch(
      persistTokensThunk({ accessToken: 'oauth-access', refreshToken: 'oauth-refresh' }),
    ).unwrap();

    expect(store.getState().auth.user).toBeNull();
  });

  it('rejects without touching Redux when the write fails', async () => {
    mockSaveTokens.mockRejectedValue(new Error('keychain unavailable'));

    const store = makeStore();
    await expect(
      store.dispatch(persistTokensThunk({ accessToken: 'a', refreshToken: 'b' })).unwrap(),
    ).rejects.toBeDefined();

    expect(store.getState().auth.accessToken).toBeNull();
    expect(store.getState().auth.error).toBeTruthy();
  });
});

describe('the two-step social sign-in, end to end', () => {
  it('persist then restore leaves a complete session', async () => {
    // Exactly what SocialSignIn does after redeeming the exchange code.
    mockGetTokens.mockResolvedValue({ accessToken: 'oauth-access', refreshToken: 'oauth-refresh' });

    const store = makeStore();
    await store.dispatch(
      persistTokensThunk({ accessToken: 'oauth-access', refreshToken: 'oauth-refresh' }),
    ).unwrap();
    await store.dispatch(loadStoredAuthThunk()).unwrap();

    const { auth } = store.getState();
    expect(auth.accessToken).toBe('oauth-access');
    expect(auth.user?.id).toBe('user-1');
    expect(auth.hasBootstrapped).toBe(true);
  });

  it('keeps the session when only the profile fetch fails', async () => {
    // A network blip must not cost a session that is otherwise valid; the 401
    // interceptor is what ends genuinely dead ones.
    mockGetTokens.mockResolvedValue({ accessToken: 'oauth-access', refreshToken: 'oauth-refresh' });
    mockGetProfile.mockRejectedValue(new Error('network down'));

    const store = makeStore();
    await store.dispatch(loadStoredAuthThunk()).unwrap();

    const { auth } = store.getState();
    expect(auth.accessToken).toBe('oauth-access');
    expect(auth.user).toBeNull();
  });
});

describe('logoutThunk', () => {
  it('revokes server-side before clearing the device', async () => {
    // Order matters: the revoke is authorised by the very token being cleared.
    const calls: string[] = [];
    mockGetRefreshToken.mockResolvedValue('refresh-def');
    mockLogout.mockImplementation(async () => { calls.push('revoke'); });
    mockClearTokens.mockImplementation(async () => { calls.push('clear'); });

    await makeStore().dispatch(logoutThunk());

    expect(calls).toEqual(['revoke', 'clear']);
    expect(mockLogout).toHaveBeenCalledWith('refresh-def');
  });

  it('still clears the device when the server call fails', async () => {
    // A shopper on a dead connection must still be able to sign out locally.
    mockGetRefreshToken.mockResolvedValue('refresh-def');
    mockLogout.mockRejectedValue(new Error('offline'));

    const store = makeStore();
    await store.dispatch(logoutThunk());

    expect(mockClearTokens).toHaveBeenCalled();
    expect(store.getState().auth.accessToken).toBeNull();
  });

  it('skips the revoke when there is no stored refresh token', async () => {
    mockGetRefreshToken.mockResolvedValue(null);

    await makeStore().dispatch(logoutThunk());

    expect(mockLogout).not.toHaveBeenCalled();
    expect(mockClearTokens).toHaveBeenCalled();
  });
});
