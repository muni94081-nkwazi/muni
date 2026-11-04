jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// `__esModule: true` matters: tokenStorage does `import * as SecureStore`, and
// without it the namespace object does not resolve to this factory's members.
const mockSecureStore = {
  __esModule: true,
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
};
jest.mock('expo-secure-store', () => mockSecureStore);
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), push: jest.fn() } }));

import { mfaApi } from '../mfa.api';
import { apiClient } from '../client';

/**
 * Mandatory 2FA enrolment, against the contract auth-service actually reads.
 *
 * Mobile could route MFA_ENROLLMENT_REQUIRED but had nowhere to route it: the
 * two-factor screen could only say enrolment was unsupported, so a seller or
 * admin with no second factor could not sign in on a phone at all.
 *
 * The details these pin down are the ones that would fail silently or
 * dangerously if they drifted: the field names auth-service destructures, the
 * body-not-header placement of the credential, and the fact that finishing
 * enrolment yields no session.
 */
describe('mfaApi.beginEnrolment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('posts the enrollment token in the body auth-service reads', async () => {
    const post = jest.spyOn(apiClient, 'post').mockResolvedValue({
      data: { data: { secret: 'S', otpauthUrl: 'otpauth://totp/x', qrCodeInstructions: 'i' } },
    } as never);

    await mfaApi.beginEnrolment('enrol-token');

    expect(post).toHaveBeenCalledWith('/api/v1/auth/2fa/generate', {
      enrollmentToken: 'enrol-token',
    });
  });

  it('sends the credential in the body, never as an Authorization header', async () => {
    const post = jest.spyOn(apiClient, 'post').mockResolvedValue({
      data: { data: { secret: 'S', otpauthUrl: 'otpauth://totp/x', qrCodeInstructions: 'i' } },
    } as never);

    await mfaApi.beginEnrolment('enrol-token');

    // requireEnrolmentActor destructures `{ enrollmentToken }` off req.body and
    // no other handler reads that field, which is what stops the credential
    // being replayable against an unrelated protected endpoint. A third
    // argument here would be a per-request config carrying headers.
    const [, body, config] = post.mock.calls[0] as [string, unknown, unknown];
    expect(body).toEqual({ enrollmentToken: 'enrol-token' });
    expect(config).toBeUndefined();
  });

  it('returns the setup information the backend sent', async () => {
    jest.spyOn(apiClient, 'post').mockResolvedValue({
      data: {
        data: {
          secret: 'JBSWY3DPEHPK3PXP',
          otpauthUrl: 'otpauth://totp/MUNI:someone@example.test?secret=JBSWY3DPEHPK3PXP',
          qrCodeInstructions: 'Scan otpauthUrl with Google Authenticator or Authy',
        },
      },
    } as never);

    const setup = await mfaApi.beginEnrolment('enrol-token');

    expect(setup.secret).toBe('JBSWY3DPEHPK3PXP');
    expect(setup.otpauthUrl).toContain('otpauth://');
  });

  it('never writes the enrollment token to SecureStore', async () => {
    jest.spyOn(apiClient, 'post').mockResolvedValue({
      data: { data: { secret: 'S', otpauthUrl: 'otpauth://totp/x', qrCodeInstructions: 'i' } },
    } as never);

    await mfaApi.beginEnrolment('enrol-token');

    expect(mockSecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it('propagates an expired token rather than resolving', async () => {
    jest.spyOn(apiClient, 'post').mockRejectedValue(
      Object.assign(new Error('401'), { response: { status: 401 } }),
    );

    await expect(mfaApi.beginEnrolment('stale-token')).rejects.toBeDefined();
  });
});

describe('mfaApi.completeEnrolment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('posts both the enrollment token and the code, under the names the server reads', async () => {
    const post = jest.spyOn(apiClient, 'post').mockResolvedValue({
      data: { success: true, message: '2FA authentication successfully enabled' },
    } as never);

    await mfaApi.completeEnrolment('enrol-token', '123456');

    expect(post).toHaveBeenCalledWith('/api/v1/auth/2fa/verify', {
      enrollmentToken: 'enrol-token',
      token: '123456',
    });
  });

  it('sends no userId — the token names its own subject', async () => {
    const post = jest.spyOn(apiClient, 'post').mockResolvedValue({
      data: { success: true },
    } as never);

    await mfaApi.completeEnrolment('enrol-token', '123456');

    const [, body] = post.mock.calls[0] as [string, Record<string, unknown>];
    expect(body).not.toHaveProperty('userId');
    expect(body).not.toHaveProperty('secret');
  });

  it('resolves to nothing — enrolment is not a session', async () => {
    jest.spyOn(apiClient, 'post').mockResolvedValue({
      data: { success: true, message: '2FA authentication successfully enabled' },
    } as never);

    const result = await mfaApi.completeEnrolment('enrol-token', '123456');

    // auth-service returns no tokens here on purpose. If this ever starts
    // handing something back, the screen must not quietly treat it as a login.
    expect(result).toBeUndefined();
  });

  it('stores no tokens on success', async () => {
    jest.spyOn(apiClient, 'post').mockResolvedValue({ data: { success: true } } as never);

    await mfaApi.completeEnrolment('enrol-token', '123456');

    expect(mockSecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it('propagates an invalid code rather than resolving', async () => {
    jest.spyOn(apiClient, 'post').mockRejectedValue(
      Object.assign(new Error('400'), {
        response: { status: 400, data: { message: 'Invalid 2FA verification token', attemptsRemaining: 4 } },
      }),
    );

    await expect(mfaApi.completeEnrolment('enrol-token', '000000')).rejects.toBeDefined();
    expect(mockSecureStore.setItemAsync).not.toHaveBeenCalled();
  });
});

describe('the access-token store is reserved for real sessions', () => {
  it('touches no persistent storage across the whole enrolment round trip', async () => {
    jest.clearAllMocks();
    jest.spyOn(apiClient, 'post').mockResolvedValue({
      data: { data: { secret: 'S', otpauthUrl: 'otpauth://totp/x', qrCodeInstructions: 'i' } },
    } as never);

    await mfaApi.beginEnrolment('enrol-token');
    await mfaApi.completeEnrolment('enrol-token', '123456');

    // Begin-to-finish: nothing written, nothing read back, nothing deleted. The
    // credential exists only in the caller's own scope for the two requests
    // that consume it, so no stale enrolment token can survive a restart and
    // nothing can later mistake it for a session.
    expect(mockSecureStore.setItemAsync).not.toHaveBeenCalled();
    expect(mockSecureStore.deleteItemAsync).not.toHaveBeenCalled();
  });
});
