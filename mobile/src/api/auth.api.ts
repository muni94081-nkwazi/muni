import { apiClient, type ApiEnvelope } from './client';
import type { AuthTokens, User } from '@/types';

// ─── Response shapes ──────────────────────────────────────────────────────────
//
// Every session endpoint now answers with the same envelope:
//
//   { success: true, data: <payload> }
//
// covering register, login, refresh, exchange and 2fa/authenticate. This is
// worth stating because it was not true until recently, and because the gateway
// does NOT normalise it — proxy.ts forwards the upstream body verbatim
// (`res.send(upstream.body)`), so whatever auth-service sends is what arrives.
//
// The history is the reason to keep the shapes matched: three of these used to
// answer bare and two enveloped, and this file unwrapped `.data` on the bare
// ones. That yielded `undefined` and broke mobile login, registration and token
// refresh at the same time — while customer-web, which read them bare, worked
// fine and hid the problem.
//
// GET /users/me is still bare. It is not a session endpoint and was out of
// scope for the standardisation; getProfile below reflects that.

/** What auth-service returns once a session actually exists. */
export interface AuthSession extends AuthTokens {
  tokenType: string;
  /** Access-token lifetime in seconds. */
  expiresIn: number;
  user: User;
}

/**
 * The three terminal states of POST /auth/login.
 *
 * The two MFA branches carry no tokens on purpose — the challenge/enrolment
 * token names one endpoint and grants nothing else. Only accounts holding
 * ROLE_ADMIN, ROLE_SUPER_ADMIN or ROLE_SELLER can reach them; a plain customer
 * always gets AUTHENTICATED.
 */
export type LoginResult =
  | ({ status: 'AUTHENTICATED' } & AuthSession)
  | { status: 'MFA_REQUIRED'; challengeToken: string; message?: string }
  | { status: 'MFA_ENROLLMENT_REQUIRED'; enrollmentToken: string; message?: string };

export const authApi = {
  /**
   * Returns the raw result rather than throwing on the MFA branches: they are
   * successful 200s, not errors, and the caller has to route to a different
   * screen for each.
   */
  login: async (email: string, password: string): Promise<LoginResult> => {
    const { data } = await apiClient.post<ApiEnvelope<LoginResult>>('/api/v1/auth/login', {
      email,
      password,
    });
    return data.data;
  },

  /**
   * Second leg of an MFA login.
   *
   * The body field is `token`, not `code` — totp.controller.ts destructures
   * `{ challengeToken, token }` and 400s on anything else.
   */
  authenticate2FA: async (challengeToken: string, token: string): Promise<AuthSession> => {
    const { data } = await apiClient.post<ApiEnvelope<AuthSession>>(
      '/api/v1/auth/2fa/authenticate',
      { challengeToken, token },
    );
    return data.data;
  },

  register: async (
    firstName: string,
    lastName: string,
    email: string,
    phoneNumber: string,
    password: string
  ): Promise<AuthSession> => {
    const { data } = await apiClient.post<ApiEnvelope<AuthSession>>('/api/v1/auth/register', {
      firstName,
      lastName,
      email,
      phoneNumber,
      password,
    });
    return data.data;
  },

  /**
   * Revokes the whole refresh-token family server-side.
   *
   * The app used to sign out by deleting the tokens from SecureStore and
   * nothing else, so a refresh token captured before that point stayed valid
   * for its full 30 days against an account whose owner believed they had
   * logged out. Clearing local storage ends the session on this device; only
   * this call ends it everywhere.
   */
  logout: async (refreshToken: string): Promise<void> => {
    await apiClient.post('/api/v1/auth/logout', { refreshToken });
  },

  // There was a `refreshTokens` helper here with zero call sites. The 401
  // interceptor in src/api/client.ts does its own bare axios POST instead —
  // deliberately, because routing a refresh back through apiClient would
  // re-enter those interceptors and recurse on a refresh that itself 401s. Two
  // implementations of one call, one of them never exercised, is how the two
  // drift apart; the one that is used is the one that stays.

  /**
   * Trades the one-time code a social login deep link carries for the session
   * behind it.
   *
   * auth-service no longer puts tokens in the redirect. A custom scheme is not
   * a private channel — any other app on the device can register `muni://` and
   * receive the same link — so the deep link now carries only a code that is
   * single-use and expires in sixty seconds.
   */
  exchangeOAuthCode: async (code: string): Promise<AuthSession> => {
    const { data } = await apiClient.post<ApiEnvelope<AuthSession>>('/api/v1/auth/exchange', {
      code,
    });
    return data.data;
  },

  forgotPassword: async (email: string): Promise<void> => {
    await apiClient.post('/api/v1/auth/forgot-password', { email });
  },

  /**
   * Completes the reset started by forgotPassword.
   *
   * auth-service reads `{ email, otp, newPassword }` and 400s with
   * "email, otp, and newPassword are required" if any is missing. This used to
   * send `{ token, password }` — every field name wrong — so the call could
   * never have succeeded. Nothing called it, because mobile had no screen to
   * enter the code on; the shopper received a reset email with nowhere to use
   * it. The password must satisfy the same policy as registration.
   */
  resetPassword: async (email: string, otp: string, newPassword: string): Promise<void> => {
    await apiClient.post('/api/v1/auth/reset-password', { email, otp, newPassword });
  },

  /**
   * The signed-in user.
   *
   * `/api/v1/users/me` — auth-service serves no `/users/profile`, so the old
   * path 404'd on every call. This one responds BARE, unlike the session
   * endpoints above: it was out of scope for the envelope standardisation, so
   * there is no `.data` to unwrap here.
   */
  getProfile: async (): Promise<User> => {
    const { data } = await apiClient.get<User>('/api/v1/users/me');
    return data;
  },
};
