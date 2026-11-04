import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';

// Shared with customer-web and seller-center. All three apps are served from one
// origin (https://muni.ug) behind nginx, so localStorage is a single shared
// store — using one key set is what makes a login in any app carry to the others.
export const ACCESS_TOKEN_KEY = 'muni_access_token';
export const REFRESH_TOKEN_KEY = 'muni_refresh_token';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
  // Sends the httpOnly `refreshToken` cookie auth-service sets at login. Behind
  // nginx the API is same-origin, which is what the cookie's sameSite=strict needs.
  withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // A file upload sends FormData, whose parts are delimited by a boundary the
  // browser generates — and it only generates one when it is left to set the
  // header itself. The instance default above declared application/json on
  // every request including those, so the multipart body went out labelled as
  // JSON with no boundary and the upstream could not find the file.
  //
  // Deleting it here rather than dropping the default keeps JSON the norm for
  // the API calls that are JSON, which is nearly all of them.
  if (config.data instanceof FormData && config.headers) {
    delete config.headers['Content-Type'];
  }

  return config;
});

// ─── Access token refresh ─────────────────────────────────────────────────────
//
// Access tokens expire after 15 minutes. The dashboard polls service health
// every 15 seconds and reloads stats on demand, so an admin who leaves the tab
// open reliably crosses that boundary — previously every call from that point
// on failed with no way back short of a manual re-login.
//
// The refresh token goes in the body as `refresh_token`: auth.controller.ts's
// refresh() reads `req.body.refresh_token`, falling back to an httpOnly cookie
// that is not sent because this client does not set withCredentials.
//
// There is still no hard `window.location` redirect here on purpose: a redirect
// fired from an interceptor turns any single background 401 into a full page
// reload, which is exactly the loop this file used to warn about. PrivateRoute
// already reacts to the cleared token on the next render.

let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) throw new Error('No refresh token available');

  // Deliberately a bare axios call, not apiClient: routing it back through the
  // instance that is currently handling a 401 is how a refresh failure turns
  // into an infinite retry loop.
  const { data } = await axios.post(`${apiClient.defaults.baseURL}/auth/refresh`, {
    refresh_token: refreshToken,
  });

  // Enveloped: `{ success, data }`, like every other session endpoint.
  const session = data.data;

  if (!session?.accessToken) {
    // A malformed refresh is a dead session, not a retryable one. Without this
    // the caller stores `undefined` and sends "Bearer undefined" from then on.
    throw new Error('Refresh response did not contain an access token');
  }

  localStorage.setItem(ACCESS_TOKEN_KEY, session.accessToken);
  if (session.refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, session.refreshToken);

  return session.accessToken as string;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    const isAuthEndpoint = original?.url?.includes('/auth/');

    if (error.response?.status === 401 && original && !original._retried && !isAuthEndpoint) {
      original._retried = true;

      try {
        // Single-flight: the dashboard fires stats, recent orders, recent
        // sellers and health together. Without this they would run four
        // refreshes, and token rotation means three of them redeem an
        // already-revoked token.
        refreshPromise ??= refreshAccessToken().finally(() => {
          refreshPromise = null;
        });

        const accessToken = await refreshPromise;
        if (original.headers) original.headers.Authorization = `Bearer ${accessToken}`;
        return apiClient(original);
      } catch {
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
      }
    }

    return Promise.reject(error);
  },
);

export default apiClient;
