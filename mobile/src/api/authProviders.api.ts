import { apiClient } from './client';

/**
 * The social sign-in providers, and whether auth-service can complete each one.
 *
 * The buttons are always offered — the sign-in screen should look the same
 * whatever a given deployment has configured — so this decides *behaviour*, not
 * visibility. `GET /api/v1/auth/providers` reports `enabled` per provider from
 * auth-service's own environment; a provider that comes back disabled still
 * renders and reports itself unavailable when tapped.
 *
 * The indirection matters: `/auth/:provider` answers 501 with a JSON body when
 * its credentials are missing, and opening that in the system browser would
 * show the shopper raw `{"success":false,…}`.
 */

export interface AuthProvider {
  name: 'google' | 'apple' | 'facebook' | string;
  enabled: boolean;
  loginUrl: string;
  displayName: string;
}

/** Offered regardless of discovery; `enabled` is filled in from the response. */
export const PROVIDER_CATALOGUE: AuthProvider[] = [
  { name: 'google', enabled: false, loginUrl: '/api/v1/auth/google', displayName: 'Continue with Google' },
  { name: 'apple', enabled: false, loginUrl: '/api/v1/auth/apple', displayName: 'Continue with Apple' },
  { name: 'facebook', enabled: false, loginUrl: '/api/v1/auth/facebook', displayName: 'Continue with Facebook' },
];

export const authProvidersApi = {
  /**
   * Every provider, each carrying whether it is currently usable. Never throws:
   * social sign-in is an accelerant, not the only way in, so a failed lookup
   * degrades to the catalogue with everything marked unavailable.
   */
  list: async (): Promise<AuthProvider[]> => {
    try {
      const { data } = await apiClient.get<{ providers: AuthProvider[] }>('/api/v1/auth/providers');
      const reported = data.providers ?? [];
      // Merged onto the catalogue so a response omitting a provider leaves its
      // button present rather than making it disappear.
      return PROVIDER_CATALOGUE.map((fallback) => {
        const match = reported.find((p) => p.name === fallback.name);
        return match ? { ...fallback, ...match } : fallback;
      });
    } catch {
      return PROVIDER_CATALOGUE;
    }
  },
};
