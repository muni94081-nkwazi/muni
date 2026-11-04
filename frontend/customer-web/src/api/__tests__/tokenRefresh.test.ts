import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from '@/utils/constants';

/**
 * Token refresh on a 401.
 *
 * The interceptor is wired into a module-level axios instance, so this drives
 * it the way the app does: stub the network, make a request fail with a 401,
 * and assert on what ends up in storage and what the caller receives.
 *
 * Two behaviours here have each been broken before, both silently:
 *
 *   the envelope — /auth/refresh answers `{ success, data }` like every other
 *     session endpoint. Reading `response.data` instead of `response.data.data`
 *     yields `undefined` for both tokens, which then get written to
 *     localStorage as the string "undefined" and sent as `Bearer undefined` on
 *     every subsequent request. Nothing throws; the session just stops working.
 *
 *   the coalescing — several requests failing at once must share ONE refresh.
 *     Without that, N concurrent 401s fire N refreshes, and because refresh
 *     ROTATES, all but the first present an already-spent token — which the
 *     server correctly treats as theft and answers by revoking the whole
 *     family. Concurrency alone would log the user out.
 */

vi.mock('axios', async () => {
  const actual = await vi.importActual<typeof import('axios')>('axios');
  return {
    ...actual,
    default: { ...actual.default, post: vi.fn() },
  };
});

const mockedPost = vi.mocked(axios.post);

/** The envelope /auth/refresh actually returns. */
function refreshResponse(accessToken: string, refreshToken: string) {
  return { data: { success: true, data: { accessToken, refreshToken } } };
}

let refreshOnce: () => Promise<string>;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  window.localStorage.clear();
  window.localStorage.setItem(ACCESS_TOKEN_KEY, 'stale-access');
  window.localStorage.setItem(REFRESH_TOKEN_KEY, 'stored-refresh');

  // Re-imported per test so the module-level coalescing promise starts clean;
  // a leaked in-flight promise would make these order-dependent.
  ({ refreshOnce } = await import('../axios.config'));
});

afterEach(() => {
  window.localStorage.clear();
});

describe('refreshOnce — reading the envelope', () => {
  it('unwraps { success, data } and stores BOTH rotated tokens', async () => {
    mockedPost.mockResolvedValue(refreshResponse('fresh-access', 'fresh-refresh'));

    const token = await refreshOnce();

    expect(token).toBe('fresh-access');
    expect(window.localStorage.getItem(ACCESS_TOKEN_KEY)).toBe('fresh-access');
    // The refresh token rotates too. Keeping the old one means the next refresh
    // presents a spent token and trips reuse detection.
    expect(window.localStorage.getItem(REFRESH_TOKEN_KEY)).toBe('fresh-refresh');
  });

  it('sends the stored refresh token to /auth/refresh', async () => {
    mockedPost.mockResolvedValue(refreshResponse('fresh-access', 'fresh-refresh'));

    await refreshOnce();

    expect(mockedPost).toHaveBeenCalledWith(
      expect.stringContaining('/auth/refresh'),
      { refreshToken: 'stored-refresh' },
    );
  });

  it('throws rather than storing undefined when the body is the wrong shape', async () => {
    // The regression guard. A bare (un-enveloped) response used to sail through
    // and poison storage with "undefined".
    mockedPost.mockResolvedValue({ data: { accessToken: 'fresh', refreshToken: 'fresh-r' } });

    await expect(refreshOnce()).rejects.toBeDefined();
    expect(window.localStorage.getItem(ACCESS_TOKEN_KEY)).toBe('stale-access');
  });

  it('throws when the envelope carries only one of the two tokens', async () => {
    mockedPost.mockResolvedValue({ data: { success: true, data: { accessToken: 'fresh' } } });

    await expect(refreshOnce()).rejects.toBeDefined();
    expect(window.localStorage.getItem(ACCESS_TOKEN_KEY)).toBe('stale-access');
  });

  it('throws when there is no stored refresh token at all', async () => {
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);

    await expect(refreshOnce()).rejects.toBeDefined();
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('propagates a rejected refresh instead of swallowing it', async () => {
    mockedPost.mockRejectedValue(new Error('401 from server'));

    await expect(refreshOnce()).rejects.toBeDefined();
  });
});

describe('refreshOnce — concurrency', () => {
  it('coalesces simultaneous callers into ONE network refresh', async () => {
    let resolveRefresh: (value: unknown) => void = () => {};
    mockedPost.mockReturnValue(
      new Promise((resolve) => { resolveRefresh = resolve; }) as ReturnType<typeof axios.post>,
    );

    const all = Promise.all([refreshOnce(), refreshOnce(), refreshOnce()]);
    resolveRefresh(refreshResponse('fresh-access', 'fresh-refresh'));
    const results = await all;

    // Three callers, one POST. Three POSTs would mean two spent tokens
    // presented to a server that treats reuse as theft.
    expect(mockedPost).toHaveBeenCalledTimes(1);
    expect(results).toEqual(['fresh-access', 'fresh-access', 'fresh-access']);
  });

  it('allows a fresh refresh after the previous one settles', async () => {
    mockedPost.mockResolvedValue(refreshResponse('first-access', 'first-refresh'));
    await refreshOnce();

    mockedPost.mockResolvedValue(refreshResponse('second-access', 'second-refresh'));
    await expect(refreshOnce()).resolves.toBe('second-access');

    expect(mockedPost).toHaveBeenCalledTimes(2);
  });
});
