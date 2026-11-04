import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import {
  ACCESS_TOKEN_KEY,
  API_BASE_URL,
  CART_SESSION_KEY,
  REFRESH_TOKEN_KEY,
} from '@/utils/constants';
import { ApiError, type ApiErrorBody } from '@/types/api.types';
import { generateSessionId, safeGetItem, safeSetItem } from '@/utils/helpers';
import { getMockResponse } from './devMocks';
import { captureError } from '@/observability/sentry';
import { logger } from '@/utils/logger';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  // Sends the httpOnly `refreshToken` cookie auth-service sets at login. Behind
  // nginx the API is same-origin, which is what the cookie's sameSite=strict needs.
  withCredentials: true,
});

function getOrCreateCartSessionId(): string {
  const existing = safeGetItem(CART_SESSION_KEY);
  if (existing) return existing;

  const created = generateSessionId();
  safeSetItem(CART_SESSION_KEY, created);
  return created;
}

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = safeGetItem(ACCESS_TOKEN_KEY);
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }

  if (config.url?.includes('/cart')) {
    config.headers.set('X-Cart-Session', getOrCreateCartSessionId());
  }

  return config;
});

let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const refreshToken = safeGetItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) {
    throw new ApiError('No refresh token available', 401);
  }

  // Enveloped, like every other session endpoint — see the contract note in
  // auth-service's auth.controller.ts.
  const response = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken });
  const { accessToken, refreshToken: newRefreshToken } = response.data.data;

  if (!accessToken || !newRefreshToken) {
    // A malformed refresh is a dead session, not a retryable one. Throwing here
    // means the caller clears the tokens rather than storing `undefined` and
    // sending "Bearer undefined" on every subsequent request.
    throw new ApiError('Refresh response did not contain both tokens', 401);
  }

  safeSetItem(ACCESS_TOKEN_KEY, accessToken);
  safeSetItem(REFRESH_TOKEN_KEY, newRefreshToken);

  return accessToken;
}

/**
 * One refresh at a time, however many requests hit a 401 at once.
 *
 * Load-bearing rather than an optimisation: /auth/refresh ROTATES, so N
 * concurrent refreshes mean N-1 of them present a token the first has already
 * spent. auth-service correctly reads that as theft and revokes the whole
 * token family — so without this, a page that fires several requests in
 * parallel logs the user out simply by being concurrent.
 *
 * Exported for its test. The interceptor below is the only caller.
 */
export function refreshOnce(): Promise<string> {
  refreshPromise ??= refreshAccessToken().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorBody>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retried?: boolean };
    const isAuthEndpoint = originalRequest?.url?.includes('/auth/');

    if (error.response?.status === 401 && originalRequest && !originalRequest._retried && !isAuthEndpoint) {
      originalRequest._retried = true;

      try {
        const newAccessToken = await refreshOnce();
        originalRequest.headers.set('Authorization', `Bearer ${newAccessToken}`);

        return apiClient(originalRequest);
      } catch {
        safeSetItem(ACCESS_TOKEN_KEY, '');
        safeSetItem(REFRESH_TOKEN_KEY, '');
        return Promise.reject(new ApiError('Session expired. Please log in again.', 401));
      }
    }

    // A cancelled request is not a failure — it's a request we deliberately
    // superseded (e.g. an older keystroke's search). It must be rethrown
    // untouched and BEFORE the `!error.response` branch below: a CanceledError
    // also carries no `response`, so it would otherwise be reported to the user
    // as "Can't reach the MUNI servers" and, worse, be retried by `withRetry`
    // as if it were a transient network outage.
    if (axios.isCancel(error)) {
      throw error;
    }

    // No `error.response` means the request never got a reply at all — the
    // backend gateway on :8080 is down/unreachable, not a rejected request.
    if (!error.response) {
      // Dev-only, opt-in escape hatch: serve canned data instead of failing,
      // so the UI is usable with no backend running at all. See devMocks.ts.
      if (import.meta.env.DEV && import.meta.env.VITE_USE_MOCK_API === 'true') {
        const path = (error.config?.url ?? '').split('?')[0];
        const mock = getMockResponse(path);
        if (mock !== undefined) {
          logger.warn(`[dev-mock] Backend unreachable — serving mock data for ${path}`);
          return { data: mock };
        }
        logger.warn(`[dev-mock] Backend unreachable and no mock registered for ${path} — see devMocks.ts`);
      }

      throw new ApiError(
        "Can't reach the MUNI servers right now. Check your connection and try again.",
        0,
        undefined,
        true,
      );
    }

    // The proxy/gateway itself returning 5xx (e.g. Vite's dev proxy answering
    // on the backend's behalf when :8080 refuses the connection) vs. the
    // backend's own application code failing both look identical here — both
    // are `error.response` with a 5xx status — so this message stays generic
    // rather than implying it's necessarily an application bug.
    const body = error.response.data;
    const isServerError = error.response.status >= 500;
    // Two envelope shapes are in play across the backend: a flat `{ message }`
    // and the newer `{ success, error: { code, message } }` that checkout- and
    // order-service return. Reading only the flat one dropped exactly the
    // messages worth showing — "Only 2 of X left", "Payment could not be
    // completed" — and fell through to axios's "Request failed with status
    // code 409".
    const baseMessage =
      body?.error?.message ??
      body?.message ??
      (isServerError
        ? 'Something went wrong on our end. Please try again in a moment.'
        : (error.message ?? 'That request could not be completed.'));

    // auth-service answers a rejected password with `issues` — one line per
    // policy rule that failed. Folding them into the message is what turns
    // "Password does not meet enterprise complexity policy" into something the
    // shopper can act on; without it the array was parsed and then discarded.
    const message = body?.issues?.length
      ? `${baseMessage}: ${body.issues.join(', ')}`
      : baseMessage;

    // Only server-side failures are reported. A 401, a 404 or a 422 is the API
    // working as designed and is the overwhelming majority of error responses —
    // sending those would bury the 5xx that actually needs someone to look.
    if (isServerError) {
      captureError(error, {
        url: originalRequest?.url,
        method: originalRequest?.method,
        status: error.response.status,
      });
    }

    throw new ApiError(message, error.response.status, body?.errors);
  },
);

/**
 * Retries an idempotent request (GET-style reads) with exponential backoff
 * when the backend is unreachable. Only reaches for `ApiError.isNetworkError`
 * — real HTTP error responses (4xx/5xx) fail immediately since retrying
 * those wastes time without changing the outcome.
 *
 * Not applied automatically to every request: mutating calls (checkout,
 * payments, order creation) must stay opt-in so retries never risk a
 * duplicate side effect against `POST`/`PATCH` endpoints.
 */
export async function withRetry<T>(
  request: () => Promise<T>,
  { retries = 2, baseDelayMs = 500 }: { retries?: number; baseDelayMs?: number } = {},
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await request();
    } catch (error) {
      const isNetworkError = error instanceof ApiError && error.isNetworkError;
      if (!isNetworkError || attempt >= retries) throw error;
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** attempt));
    }
  }
}
