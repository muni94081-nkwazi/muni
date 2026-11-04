import axiosInstance from './axios.config';
import { logger } from '@/utils/logger';

export interface SellerUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  roles: string[];
}

export interface AuthResult {
  user: SellerUser;
  accessToken: string;
  /**
   * auth-service returns this alongside the access token (auth.controller.ts's
   * `res.json(result)`), but it was missing from this type and so never
   * persisted — leaving the 15-minute access token with nothing to renew from.
   * Optional because the MFA branches of /auth/login return neither token.
   */
  refreshToken?: string;
}

export const authApi = {
  // A failed login must reject. The previous implementation swallowed every
  // error and returned a synthetic ROLE_SELLER session with accessToken
  // 'mock-token' — so a wrong password, a 403, or an unreachable gateway all
  // looked like a successful sign-in. PrivateRoute's role check passed, the
  // dashboard mounted, and then every subsequent request 401'd against the
  // real gateway (which correctly rejects 'mock-token'). Not a privilege
  // escalation, but it turned "wrong password" into an unexplained broken UI.
  login: async (email: string, password: string): Promise<AuthResult> => {
    try {
      // Enveloped: `{ success, data }`. Every endpoint that issues, refreshes
      // or exchanges a session shares that shape — see the contract note at the
      // top of auth-service's auth.controller.ts.
      const response = await axiosInstance.post('/auth/login', { email, password });
      return response.data.data;
    } catch (error) {
      logger.error(error);
      throw error;
    }
  },
  register: async (input: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phoneNumber?: string;
  }): Promise<AuthResult> => {
    const response = await axiosInstance.post('/auth/register', input);
    return response.data.data;
  },
  logout: async () => {
    return Promise.resolve();
  },
  // Must reject on failure, for the same reason login above must.
  //
  // This previously caught every error and returned a synthetic user carrying
  // roles: ['ROLE_SELLER']. PrivateRoute checks exactly that array, so any
  // failure of /users/me — an expired session, a 403, an unreachable gateway —
  // mounted the entire Seller Center for whoever was sitting there, including a
  // ROLE_CUSTOMER who has only just applied. No backend authorisation was
  // bypassed (every subsequent call still 401s), but the UI asserted a role the
  // account did not have, which is the one thing a role check must never do.
  getCurrentUser: async (): Promise<SellerUser> => {
    try {
      const response = await axiosInstance.get('/users/me');
      return response.data;
    } catch (error) {
      logger.error(error);
      throw error;
    }
  },
  updateProfile: async (data: Record<string, unknown>) => {
    return data;
  },
};
