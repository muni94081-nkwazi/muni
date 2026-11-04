import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { renderWithProviders, makeUser, signedOut } from '@/test-utils/renderWithProviders';
import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from '@/utils/constants';

vi.mock('@/api/auth.api', () => ({
  authApi: { getCurrentUser: vi.fn(), exchangeOAuthCode: vi.fn() },
}));

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

import { authApi } from '@/api/auth.api';
import { OAuthCallback } from '../OAuthCallback';

const mocked = vi.mocked(authApi);

/**
 * The landing leg of a social sign-in.
 *
 * The contract this asserts changed: auth-service no longer puts tokens in the
 * redirect's query string. It sends a single one-time `code`, which this page
 * trades for the session at POST /auth/exchange. What still matters is that the
 * tokens end up under the keys the password flow uses — the axios interceptor
 * and the refresh path read those two and nothing else — and that the shopper
 * only reaches the dashboard once the session is real.
 */
function renderCallback(query: string) {
  return renderWithProviders(<OAuthCallback />, {
    preloadedState: { ...signedOut() },
    route: `/auth/callback${query}`,
  });
}

const session = {
  accessToken: 'access-abc',
  refreshToken: 'refresh-def',
  tokenType: 'Bearer',
  expiresIn: 900,
};

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('OAuthCallback — successful return', () => {
  it('redeems the one-time code rather than reading tokens from the URL', async () => {
    mocked.exchangeOAuthCode.mockResolvedValue(session);
    mocked.getCurrentUser.mockResolvedValue(makeUser());

    renderCallback('?code=one-time-code');

    await waitFor(() => {
      expect(mocked.exchangeOAuthCode).toHaveBeenCalledWith('one-time-code');
    });
  });

  it('stores the tokens under the same keys the password login writes', async () => {
    mocked.exchangeOAuthCode.mockResolvedValue(session);
    mocked.getCurrentUser.mockResolvedValue(makeUser());

    renderCallback('?code=one-time-code');

    await waitFor(() => {
      expect(window.localStorage.getItem(ACCESS_TOKEN_KEY)).toBe('access-abc');
    });
    expect(window.localStorage.getItem(REFRESH_TOKEN_KEY)).toBe('refresh-def');
  });

  it('waits for the profile before sending the shopper to the dashboard', async () => {
    mocked.exchangeOAuthCode.mockResolvedValue(session);

    let resolveProfile: (user: ReturnType<typeof makeUser>) => void = () => {};
    mocked.getCurrentUser.mockReturnValue(
      new Promise((resolve) => {
        resolveProfile = resolve;
      }),
    );

    renderCallback('?code=one-time-code');

    // Navigating here would land on PrivateRoute before `isAuthenticated` is
    // set, which bounces straight back to /login.
    expect(navigate).not.toHaveBeenCalled();

    resolveProfile(makeUser());
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/dashboard', { replace: true });
    });
  });

  it('marks the session authenticated so the dashboard guard lets it through', async () => {
    mocked.exchangeOAuthCode.mockResolvedValue(session);
    mocked.getCurrentUser.mockResolvedValue(makeUser());

    const { store } = renderCallback('?code=one-time-code');

    await waitFor(() => {
      const state = store.getState() as { auth: { isAuthenticated: boolean } };
      expect(state.auth.isAuthenticated).toBe(true);
    });
  });

  it('redeems the code exactly once even under StrictMode double-mounting', async () => {
    mocked.exchangeOAuthCode.mockResolvedValue(session);
    mocked.getCurrentUser.mockResolvedValue(makeUser());

    renderCallback('?code=one-time-code');

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/dashboard', { replace: true });
    });
    // The code is single-use server-side, so a second POST would genuinely fail.
    expect(mocked.exchangeOAuthCode).toHaveBeenCalledTimes(1);
  });
});

describe('OAuthCallback — failure', () => {
  it('says the sign-in was cancelled, rather than that MUNI is broken', async () => {
    // Every failure used to share one message — "temporarily unavailable" —
    // which told someone who simply closed the Google dialog that the service
    // was down. The toast is asserted on the store rather than the DOM:
    // ToastContainer is mounted by AuthLayout, one level above this component.
    const { store } = renderCallback('?reason=access_denied');

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/login', { replace: true });
    });
    const { ui } = store.getState() as { ui: { toasts: { message: string }[] } };
    expect(ui.toasts[0]?.message).toMatch(/cancelled/i);
    expect(mocked.exchangeOAuthCode).not.toHaveBeenCalled();
  });

  it('explains a disabled account instead of blaming the provider', async () => {
    const { store } = renderCallback('?reason=account_disabled');

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/login', { replace: true });
    });
    const { ui } = store.getState() as { ui: { toasts: { message: string }[] } };
    expect(ui.toasts[0]?.message).toMatch(/deactivated/i);
  });

  it('explains an unverified email, which is a refusal to link, not an outage', async () => {
    const { store } = renderCallback('?reason=unverified_email');

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/login', { replace: true });
    });
    const { ui } = store.getState() as { ui: { toasts: { message: string }[] } };
    expect(ui.toasts[0]?.message).toMatch(/could not confirm your email/i);
  });

  it('explains a rejected state, which is what a stale or forged callback gets', async () => {
    const { store } = renderCallback('?reason=invalid_state');

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/login', { replace: true });
    });
    const { ui } = store.getState() as { ui: { toasts: { message: string }[] } };
    expect(ui.toasts[0]?.message).toMatch(/expired or did not come from this browser/i);
  });

  it('returns to login when the exchange itself fails', async () => {
    mocked.exchangeOAuthCode.mockRejectedValue(new Error('code expired'));

    renderCallback('?code=stale-code');

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/login', { replace: true });
    });
    // Nothing was stored: there were never any tokens to keep.
    expect(window.localStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
  });

  it('treats a redirect carrying no code as a failure', async () => {
    renderCallback('?start=google&return=muni%3A%2F%2Fauth%2Fcallback');

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/login', { replace: true });
    });
    expect(mocked.exchangeOAuthCode).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
  });
});
