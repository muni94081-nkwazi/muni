import { apiClient } from './axios.config';
import type { AuthenticatedAdmin, AuthResponse, LoginPayload } from '@/types/user.types';

// /auth/login is enveloped as `{ success, data }` — every endpoint that issues,
// refreshes or exchanges a session shares that shape now. See the contract note
// at the top of auth-service's auth.controller.ts.
//
// /users/me is NOT: it still returns its payload directly. That endpoint was
// out of scope for the standardisation, so the two reads below differ on
// purpose rather than by neglect.
export const authApi = {
  login: async (payload: LoginPayload): Promise<AuthResponse> => {
    const { data } = await apiClient.post<{ success: boolean; data: AuthResponse }>('/auth/login', {
      email: payload.email,
      password: payload.password,
    });
    return data.data;
  },

  getCurrentUser: async (): Promise<AuthenticatedAdmin> => {
    const { data } = await apiClient.get<AuthenticatedAdmin>('/users/me');
    return data;
  },

  logout: async (): Promise<void> => {
    await apiClient.post('/auth/logout');
  },
};
