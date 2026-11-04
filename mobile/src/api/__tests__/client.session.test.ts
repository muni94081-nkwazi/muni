/**
 * The 401 interceptor has to tell two situations apart:
 *
 *   - a signed-in shopper whose session has expired  -> end it, go to login
 *   - a guest touching a protected endpoint          -> hand the error back
 *
 * It used to treat both as expiry: any 401 fell into the refresh path, found no
 * refresh token, threw, and replaced the whole app with the login screen. That
 * is the wrong answer for someone who was never signed in — they should meet
 * the contextual sign-in on the screen they are already on.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// The mock functions are created inside the factories: jest hoists these calls
// above the file's own consts, so a factory closing over an outer `const` would
// capture it before it is initialised.
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), push: jest.fn() } }));
jest.mock('../tokenStorage', () => ({
  getAccessToken: jest.fn(),
  getRefreshToken: jest.fn(),
  clearTokens: jest.fn(async () => undefined),
  saveTokens: jest.fn(async () => undefined),
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

import axios, { type AxiosError, AxiosHeaders } from 'axios';
import { router } from 'expo-router';
import { apiClient, setNavigationReady } from '../client';
import { clearTokens, getAccessToken, getRefreshToken } from '../tokenStorage';

const mockReplace = router.replace as jest.Mock;
const mockClearTokens = clearTokens as jest.Mock;
const mockGetAccessToken = getAccessToken as jest.Mock;
const mockGetRefreshToken = getRefreshToken as jest.Mock;

/** Drives the response interceptor exactly as axios would on a 401. */
async function trigger401(): Promise<unknown> {
  const handlers = (
    apiClient.interceptors.response as unknown as {
      handlers: Array<{ rejected: (e: AxiosError) => Promise<unknown> }>;
    }
  ).handlers;
  const onRejected = handlers[handlers.length - 1].rejected;

  const error = {
    config: { headers: new AxiosHeaders() },
    response: { status: 401 },
    isAxiosError: true,
  } as unknown as AxiosError;

  return onRejected(error).catch((e: unknown) => e);
}

describe('401 handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setNavigationReady(true);
  });

  it('does not send a guest to login when a protected call 401s', async () => {
    mockGetAccessToken.mockResolvedValue(null);
    mockGetRefreshToken.mockResolvedValue(null);

    await trigger401();

    expect(mockReplace).not.toHaveBeenCalled();
    // Nothing to clear either — there was never a session.
    expect(mockClearTokens).not.toHaveBeenCalled();
  });

  it('rejects with the original error so the screen can prompt for sign-in', async () => {
    mockGetAccessToken.mockResolvedValue(null);
    mockGetRefreshToken.mockResolvedValue(null);

    const result = (await trigger401()) as AxiosError;

    expect(result?.response?.status).toBe(401);
  });

  it('still ends a real session when its refresh fails', async () => {
    mockGetAccessToken.mockResolvedValue('stale-access');
    mockGetRefreshToken.mockResolvedValue('stale-refresh');
    jest.spyOn(axios, 'post').mockRejectedValue(new Error('refresh rejected'));

    await trigger401();

    // Session expiry behaviour is unchanged: tokens cleared, back to login.
    expect(mockClearTokens).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
  });

  it('ends the session even if only an access token remains', async () => {
    // A half-torn-down session is still a session, not a guest.
    mockGetAccessToken.mockResolvedValue('orphan-access');
    mockGetRefreshToken.mockResolvedValue(null);

    await trigger401();

    expect(mockClearTokens).toHaveBeenCalled();
  });

  it('does not navigate before the navigator has mounted', async () => {
    setNavigationReady(false);
    mockGetAccessToken.mockResolvedValue('stale-access');
    mockGetRefreshToken.mockResolvedValue('stale-refresh');
    jest.spyOn(axios, 'post').mockRejectedValue(new Error('refresh rejected'));

    await trigger401();

    expect(mockClearTokens).toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('recovers the request when the refresh succeeds', async () => {
    mockGetAccessToken.mockResolvedValue('stale-access');
    mockGetRefreshToken.mockResolvedValue('good-refresh');
    jest
      .spyOn(axios, 'post')
      // Enveloped: `{ success, data }`, matching what /auth/refresh returns
      // now that every session endpoint shares one shape. The outer `data` is
      // axios's; the inner one is the envelope's.
      .mockResolvedValue({ data: { success: true, data: { accessToken: 'fresh', refreshToken: 'fresh-r' } } });

    await trigger401();

    // A recoverable 401 must not look like an expiry.
    expect(mockClearTokens).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
