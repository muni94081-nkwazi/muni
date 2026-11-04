import { apiClient } from './axios.config';
import type {
  AuthResponse,
  ChangePasswordPayload,
  ForgotPasswordPayload,
  LoginPayload,
  LoginResult,
  RegisterPayload,
  ResetPasswordPayload,
  SessionTokens,
  UpdateProfilePayload,
  User,
} from '@/types/user.types';

/**
 * The envelope every session endpoint answers with.
 *
 * register, login, refresh, exchange and 2fa/authenticate all return
 * `{ success, data }`. They used not to — three were bare and two enveloped,
 * with no rule saying which — so each call site hardcoded a guess. See the
 * contract note at the top of auth-service's auth.controller.ts.
 */
interface Enveloped<T> {
  success: boolean;
  data: T;
}

export const authApi = {
  /**
   * Returns the raw result rather than throwing on the MFA branches: they are
   * successful 200s, not errors, and each routes to a different screen.
   *
   * `data` is the discriminated union — auth-service tags all three outcomes
   * with `status`, including the plain success path.
   */
  async login(payload: LoginPayload): Promise<LoginResult> {
    const { data } = await apiClient.post<Enveloped<LoginResult>>('/auth/login', payload);
    return data.data;
  },

  /**
   * Second leg of an MFA login. The body field is `token`, not `code` —
   * totp.controller destructures `{ challengeToken, token }` and 400s on
   * anything else.
   */
  async authenticate2FA(challengeToken: string, token: string): Promise<SessionTokens> {
    const { data } = await apiClient.post<Enveloped<SessionTokens>>('/auth/2fa/authenticate', {
      challengeToken,
      token,
    });
    return data.data;
  },

  /**
   * Trades the one-time code a social login redirect carries for the session
   * behind it. The tokens no longer ride in the redirect URL, so this POST is
   * what completes an OAuth sign-in. Also sets the httpOnly refresh cookie
   * server-side, so a social session refreshes exactly like an email one.
   */
  async exchangeOAuthCode(code: string): Promise<SessionTokens> {
    const { data } = await apiClient.post<Enveloped<SessionTokens>>('/auth/exchange', { code });
    return data.data;
  },

  async register(payload: RegisterPayload): Promise<AuthResponse> {
    const { data } = await apiClient.post<Enveloped<AuthResponse>>('/auth/register', payload);
    return data.data;
  },

  async logout(): Promise<void> {
    await apiClient.post('/auth/logout');
  },

  async forgotPassword(payload: ForgotPasswordPayload): Promise<void> {
    await apiClient.post('/auth/forgot-password', payload);
  },

  async resetPassword(payload: ResetPasswordPayload): Promise<void> {
    await apiClient.post('/auth/reset-password', payload);
  },

  async getCurrentUser(): Promise<User> {
    const { data } = await apiClient.get<User>('/users/me');
    return data;
  },

  async updateProfile(payload: UpdateProfilePayload): Promise<User> {
    const { data } = await apiClient.patch<User>('/users/me', payload);
    return data;
  },

  async changePassword(payload: ChangePasswordPayload): Promise<void> {
    await apiClient.post('/users/me/change-password', payload);
  },
};
