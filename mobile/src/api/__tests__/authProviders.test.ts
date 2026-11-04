jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), push: jest.fn() } }));

import { authProvidersApi, PROVIDER_CATALOGUE } from '../authProviders.api';
import { apiClient } from '../client';

/**
 * The buttons are always offered; discovery only decides whether tapping one
 * navigates or reports the method unavailable. These pin that the list never
 * empties — an empty list would hide the section, which is the behaviour this
 * deliberately replaced.
 */
describe('authProvidersApi.list', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns all three providers when discovery reports none', async () => {
    jest.spyOn(apiClient, 'get').mockResolvedValue({ data: { providers: [] } } as never);

    const providers = await authProvidersApi.list();

    expect(providers.map((p) => p.name)).toEqual(['google', 'apple', 'facebook']);
    expect(providers.every((p) => !p.enabled)).toBe(true);
  });

  it('returns all three when the lookup fails outright', async () => {
    jest.spyOn(apiClient, 'get').mockRejectedValue(new Error('network'));

    const providers = await authProvidersApi.list();

    expect(providers).toEqual(PROVIDER_CATALOGUE);
  });

  it('marks a configured provider enabled and leaves the rest offered', async () => {
    jest.spyOn(apiClient, 'get').mockResolvedValue({
      data: {
        providers: [
          {
            name: 'google',
            enabled: true,
            loginUrl: '/api/v1/auth/google',
            displayName: 'Continue with Google',
          },
        ],
      },
    } as never);

    const providers = await authProvidersApi.list();

    expect(providers).toHaveLength(3);
    expect(providers.find((p) => p.name === 'google')?.enabled).toBe(true);
    expect(providers.find((p) => p.name === 'apple')?.enabled).toBe(false);
  });

  it('keeps the real login URLs, which are /auth/:provider not /auth/oauth/:provider', async () => {
    jest.spyOn(apiClient, 'get').mockResolvedValue({ data: { providers: [] } } as never);

    const providers = await authProvidersApi.list();

    expect(providers.map((p) => p.loginUrl)).toEqual([
      '/api/v1/auth/google',
      '/api/v1/auth/apple',
      '/api/v1/auth/facebook',
    ]);
  });

  it('never throws, so a failed lookup cannot break the sign-in screen', async () => {
    jest.spyOn(apiClient, 'get').mockRejectedValue(new Error('boom'));

    await expect(authProvidersApi.list()).resolves.toBeDefined();
  });
});
