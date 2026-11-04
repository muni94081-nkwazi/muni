import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import {
  API_BASE_URL,
  ACCESS_TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  safeGetItem,
  safeSetItem,
  safeRemoveItem,
} from '../utils/constants';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  // Sends the httpOnly `refreshToken` cookie auth-service sets at login. Behind
  // nginx the API is same-origin, which is what the cookie's sameSite=strict needs.
  withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
  const token = safeGetItem(ACCESS_TOKEN_KEY);
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
// Access tokens expire after 15 minutes. Without this, a seller left on the
// payouts page for a quarter of an hour saw every subsequent call fail with no
// way back except a manual reload — and REFRESH_TOKEN_KEY was declared here but
// never written to, so there was nothing to recover with either.
//
// The refresh token goes in the body as `refresh_token`: auth.controller.ts's
// refresh() reads `req.body.refresh_token`, falling back to an httpOnly cookie
// that is not sent because this client does not set withCredentials.

let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const refreshToken = safeGetItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) throw new Error('No refresh token available');

  // Deliberately a bare axios call, not apiClient: routing it back through the
  // instance that is currently handling a 401 is how a refresh failure turns
  // into an infinite retry loop.
  const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, { refresh_token: refreshToken });

  // Enveloped: `{ success, data }`, like every other session endpoint.
  const session = data.data;

  if (!session?.accessToken) {
    // A malformed refresh is a dead session, not a retryable one. Without this
    // the caller stores `undefined` and sends "Bearer undefined" from then on.
    throw new Error('Refresh response did not contain an access token');
  }

  safeSetItem(ACCESS_TOKEN_KEY, session.accessToken);
  if (session.refreshToken) safeSetItem(REFRESH_TOKEN_KEY, session.refreshToken);

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
        // Single-flight: a page that fires several requests at once would
        // otherwise run several refreshes, and token rotation means all but one
        // of them redeems an already-revoked token.
        refreshPromise ??= refreshAccessToken().finally(() => {
          refreshPromise = null;
        });

        const accessToken = await refreshPromise;
        if (original.headers) original.headers.Authorization = `Bearer ${accessToken}`;
        return apiClient(original);
      } catch {
        safeRemoveItem(ACCESS_TOKEN_KEY);
        safeRemoveItem(REFRESH_TOKEN_KEY);
        // No forced navigation from here — PrivateRoute reacts to the cleared
        // token on the next render, and a hard redirect out of an interceptor
        // discards whatever the seller was in the middle of.
      }
    }

    return Promise.reject(error);
  },
);

export default apiClient;
