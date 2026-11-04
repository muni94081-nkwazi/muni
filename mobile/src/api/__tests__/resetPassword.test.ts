jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), push: jest.fn() } }));

import { authApi } from '../auth.api';
import { apiClient } from '../client';

/**
 * auth-service reads `{ email, otp, newPassword }` and 400s with
 * "email, otp, and newPassword are required" otherwise. The client used to send
 * `{ token, password }` — every field name wrong — so a reset could never have
 * completed. This pins the payload to the contract.
 */
describe('authApi.resetPassword', () => {
  it('sends the field names auth-service actually reads', async () => {
    const post = jest.spyOn(apiClient, 'post').mockResolvedValue({ data: {} } as never);

    await authApi.resetPassword('shopper@example.com', '123456', 'Str0ng!Passw0rd');

    expect(post).toHaveBeenCalledWith('/api/v1/auth/reset-password', {
      email: 'shopper@example.com',
      otp: '123456',
      newPassword: 'Str0ng!Passw0rd',
    });

    // The names that were being sent before must not reappear.
    const [, body] = post.mock.calls[0] as [string, Record<string, unknown>];
    expect(body).not.toHaveProperty('token');
    expect(body).not.toHaveProperty('password');

    post.mockRestore();
  });

  it('posts to the reset-password route', async () => {
    const post = jest.spyOn(apiClient, 'post').mockResolvedValue({ data: {} } as never);

    await authApi.resetPassword('a@b.com', '000000', 'Str0ng!Passw0rd');

    expect(post.mock.calls[0][0]).toBe('/api/v1/auth/reset-password');
    post.mockRestore();
  });

  it('lets a rejected reset surface to the caller', async () => {
    // An expired or wrong code is a 400 the screen must show, not swallow.
    const post = jest
      .spyOn(apiClient, 'post')
      .mockRejectedValue(Object.assign(new Error('bad'), { response: { status: 400 } }));

    await expect(authApi.resetPassword('a@b.com', '999999', 'Str0ng!Passw0rd')).rejects.toThrow();
    post.mockRestore();
  });
});
