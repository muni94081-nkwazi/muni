import axios, {
  AxiosError,
  AxiosHeaders,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { API_URL } from '@/constants';
import { logger } from '@/utils/logger';
import { emitSessionExpired } from './authEvents';
import { clearTokens, getAccessToken, getRefreshToken, saveTokens } from './tokenStorage';
import { captureError } from '@/observability/sentry';

/** Shape every service returns through the gateway's response transform. */
export interface ApiEnvelope<T> {
  data: T;
}

/** Axios does not model our `_retry` marker, so extend its config type. */
interface RetriableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 10_000,
  headers: {
    'Content-Type': 'application/json',
    'X-App-Platform': 'mobile',
    'X-App-Version': Constants.expoConfig?.version ?? '1.0.0',
  },
});

apiClient.interceptors.request.use(async (config) => {
  const token = await getAccessToken();
  if (token) {
    // Axios normalises config.headers to an AxiosHeaders instance before the
    // request interceptors run, so `.set()` is always available here.
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

/**
 * Whether the root navigator is mounted and can accept an imperative navigate.
 *
 * Module-level rather than React state because `endSession` below is called
 * from an axios interceptor, outside any component, where hooks cannot run.
 * `app/_layout.tsx` keeps it in step with expo-router's own
 * `useRootNavigationState()`, so this is a mirror of real navigator readiness
 * rather than a guess or a timer.
 */
let navigationReady = false;

/** Set by app/_layout.tsx as the root navigator mounts and unmounts. */
export function setNavigationReady(ready: boolean): void {
  navigationReady = ready;
}

/**
 * Ends the session: wipes storage, tells Redux, and returns the user to login.
 *
 * Previously this only cleared SecureStore and navigated, leaving Redux still
 * holding an access token — so protected screens kept rendering signed-in
 * content while every request 401'd.
 *
 * The navigate is conditional. Session restoration issues a request during
 * startup, while AppRoot is deliberately withholding the navigation tree — so
 * a stored session whose refresh token has also expired would reach this line
 * with no navigator mounted to receive the replace.
 *
 * Suppressing the navigate is safe: clearing the tokens and resetting Redux is
 * what actually ends the session, and both happen unconditionally above. A
 * signed-out shopper keeps the public storefront and meets a sign-in prompt on
 * the first protected screen they open. Once the app is running normally
 * `navigationReady` is true and the replace happens as before.
 */
async function endSession(): Promise<void> {
  await clearTokens();
  emitSessionExpired();
  if (navigationReady) {
    router.replace('/(auth)/login');
  }
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetriableRequestConfig | undefined;

    // Server-side failures only. A 401, 404 or 422 is the API working as
    // designed and is most of the error traffic; reporting those would bury the
    // 5xx that needs someone to look.
    if ((error.response?.status ?? 0) >= 500) {
      captureError(error, {
        url: originalRequest?.url,
        method: originalRequest?.method,
        status: error.response?.status,
      });
    }

    if (error.response?.status !== 401 || !originalRequest || originalRequest._retry) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    // A guest has no session to expire. Without this, any 401 from a protected
    // endpoint — the wishlist, a conversation, an order — fell straight through
    // to the refresh path, found no refresh token, threw, and ended the
    // "session" by replacing the whole app with the login screen. A signed-out
    // shopper is supposed to meet a contextual sign-in on that screen instead,
    // so the error is handed back to the caller untouched.
    const [refreshToken, accessToken] = await Promise.all([getRefreshToken(), getAccessToken()]);
    if (!refreshToken && !accessToken) {
      return Promise.reject(error);
    }

    try {
      if (!refreshToken) throw new Error('No refresh token stored');

      // Deliberately a bare axios call, not apiClient: routing it back through
      // this instance would re-enter these interceptors and, on a refresh that
      // itself 401s, recurse.
      //
      // Enveloped, like every other session endpoint — see the contract note in
      // auth-service's auth.controller.ts. The gateway forwards the upstream
      // body verbatim (`res.send(upstream.body)`), so this is exactly what
      // auth-service sent. The token check below is what turns a shape change
      // into a clear error rather than a session that silently stores
      // `undefined` and sends "Bearer undefined" on every later request.
      const res = await axios.post<ApiEnvelope<{ accessToken: string; refreshToken: string }>>(
        `${API_URL}/api/v1/auth/refresh`,
        { refreshToken },
        { timeout: 10_000 }
      );

      const tokens = res.data?.data;
      if (!tokens?.accessToken || !tokens?.refreshToken) {
        throw new Error('Refresh response did not contain both tokens');
      }

      await saveTokens(tokens);

      originalRequest.headers = AxiosHeaders.from(originalRequest.headers);
      originalRequest.headers.set('Authorization', `Bearer ${tokens.accessToken}`);
      return apiClient(originalRequest);
    } catch (err) {
      logger.warn('[apiClient] Token refresh failed, ending session:', err);
      await endSession();
      return Promise.reject(err);
    }
  }
);
