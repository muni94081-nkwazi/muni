/**
 * SocialSignIn.test.tsx
 *
 * The deep-link handoff at the end of a social sign-in.
 *
 * This is the hardest leg of the flow to reason about and was completely
 * untested: the app opens the system browser, auth-service redirects back to a
 * custom scheme, and whatever rides on that URL becomes a session. Two things
 * about it are easy to get wrong and impossible to see from a type:
 *
 *   the payload — the deep link carries a one-time `code`, NOT tokens. A custom
 *     scheme is not a private channel; any other app on the device can register
 *     `muni://` and receive the same link. If this component ever went back to
 *     reading access_token/refresh_token off the URL, nothing would fail loudly.
 *
 *   the non-success paths — a dismissed browser is a shopper changing their
 *     mind, not an error, and must say nothing. A `reason` in the URL is
 *     auth-service refusing the login and must say WHAT.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));

// react-native-paper's Snackbar reads safe-area insets, which are supplied by a
// SafeAreaProvider the real app mounts at its root. Stubbing the insets is less
// machinery than wrapping every render, and this test asserts on the Snackbar's
// props rather than its layout.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
  SafeAreaInsetsContext: { Consumer: ({ children }: { children: (i: unknown) => React.ReactNode }) => children({ top: 0, bottom: 0, left: 0, right: 0 }) },
}));

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ router: { replace: (...a: unknown[]) => mockReplace(...a) } }));

const mockOpenAuthSession = jest.fn();
jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: (...a: unknown[]) => mockOpenAuthSession(...a),
}));

jest.mock('expo-linking', () => ({
  createURL: (path: string) => `muni://${path}`,
  parse: (url: string) => {
    const [, query = ''] = url.split('?');
    const queryParams: Record<string, string> = {};
    for (const pair of query.split('&').filter(Boolean)) {
      const [k, v] = pair.split('=');
      queryParams[k] = decodeURIComponent(v ?? '');
    }
    return { queryParams };
  },
}));

const mockListProviders = jest.fn();
jest.mock('../../api/authProviders.api', () => ({
  authProvidersApi: { list: () => mockListProviders() },
  PROVIDER_CATALOGUE: [
    { name: 'google', enabled: false, loginUrl: '/api/v1/auth/google', displayName: 'Continue with Google' },
  ],
}));

const mockExchange = jest.fn();
jest.mock('../../api/auth.api', () => ({
  authApi: { exchangeOAuthCode: (code: string) => mockExchange(code) },
}));

const mockPersistTokens = jest.fn((_arg: unknown) => ({ type: 'auth/persistTokens/fulfilled', payload: {} }));
const mockLoadStoredAuth = jest.fn(() => ({ type: 'auth/loadStoredAuth/fulfilled', payload: {} }));
jest.mock('../../store/auth.slice', () => ({
  persistTokensThunk: (arg: unknown) => mockPersistTokens(arg),
  loadStoredAuthThunk: () => mockLoadStoredAuth(),
}));

const mockDispatch = jest.fn(() => ({ unwrap: async () => ({}) }));
jest.mock('../../store/hooks', () => ({ useAppDispatch: () => mockDispatch }));

import React from 'react';
import { act, create, type TestInstance, type TestRenderer } from 'react-test-renderer';
import { SocialSignIn } from '../SocialSignIn';

const GOOGLE_ENABLED = [
  { name: 'google', enabled: true, loginUrl: '/api/v1/auth/google', displayName: 'Continue with Google' },
];

/** Render, and let the provider-discovery effect settle. */
async function renderComponent(): Promise<TestRenderer> {
  let tree!: TestRenderer;
  await act(async () => {
    tree = create(<SocialSignIn />);
  });
  await act(async () => { await Promise.resolve(); });
  return tree;
}

/** Press the Google button. */
async function pressGoogle(tree: TestRenderer): Promise<void> {
  const button = tree.root.findAll(
    (n: TestInstance) => n.props.accessibilityRole === 'button' && n.props.accessibilityLabel === 'Continue with Google',
  )[0];
  await act(async () => {
    (button.props.onPress as () => void)();
  });
  await act(async () => { await Promise.resolve(); });
}

/** Whatever the Snackbar is currently showing. */
function snackbarText(tree: TestRenderer): string {
  const snack = tree.root.findAll((n: TestInstance) => n.props?.visible !== undefined && Boolean(n.props?.onDismiss))[0];
  if (!snack) return '';
  return snack.props.visible ? String(snack.props.children ?? '') : '';
}

beforeEach(() => {
  jest.clearAllMocks();
  mockListProviders.mockResolvedValue(GOOGLE_ENABLED);
  mockExchange.mockResolvedValue({
    accessToken: 'oauth-access',
    refreshToken: 'oauth-refresh',
    tokenType: 'Bearer',
    expiresIn: 900,
  });
  mockDispatch.mockReturnValue({ unwrap: async () => ({}) });
});

describe('SocialSignIn — starting the flow', () => {
  it('opens the browser at the provider, carrying its own deep link as state', async () => {
    mockOpenAuthSession.mockResolvedValue({ type: 'dismiss' });

    const tree = await renderComponent();
    await pressGoogle(tree);

    const [startUrl, returnUrl] = mockOpenAuthSession.mock.calls[0] as [string, string];
    expect(startUrl).toContain('/api/v1/auth/google');
    // The deep link rides in `state` so auth-service knows to redirect back to
    // the app rather than to the web callback.
    expect(startUrl).toContain(`state=${encodeURIComponent('muni://auth/callback')}`);
    expect(returnUrl).toBe('muni://auth/callback');
  });

  it('says the method is unavailable without opening a browser when the provider is off', async () => {
    mockListProviders.mockResolvedValue([{ ...GOOGLE_ENABLED[0], enabled: false }]);

    const tree = await renderComponent();
    await pressGoogle(tree);

    expect(mockOpenAuthSession).not.toHaveBeenCalled();
    expect(snackbarText(tree)).toMatch(/temporarily unavailable/i);
  });
});

describe('SocialSignIn — the deep-link handoff', () => {
  it('redeems the one-time code from the callback URL', async () => {
    mockOpenAuthSession.mockResolvedValue({
      type: 'success',
      url: 'muni://auth/callback?code=one-time-code',
    });

    const tree = await renderComponent();
    await pressGoogle(tree);

    expect(mockExchange).toHaveBeenCalledWith('one-time-code');
  });

  it('persists the exchanged tokens and then restores the profile', async () => {
    mockOpenAuthSession.mockResolvedValue({
      type: 'success',
      url: 'muni://auth/callback?code=one-time-code',
    });

    const tree = await renderComponent();
    await pressGoogle(tree);

    expect(mockPersistTokens).toHaveBeenCalledWith({
      accessToken: 'oauth-access',
      refreshToken: 'oauth-refresh',
    });
    // The profile is a separate step — role checks read user.roles, which the
    // exchange response does not carry.
    expect(mockLoadStoredAuth).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalled();
  });

  it('does NOT read tokens off the URL', async () => {
    // The regression guard. If this component went back to trusting the deep
    // link's own query params, a malicious app registering `muni://` would
    // receive a live session — and no type or build step would notice.
    mockOpenAuthSession.mockResolvedValue({
      type: 'success',
      url: 'muni://auth/callback?access_token=leaked&refresh_token=leaked-r',
    });

    const tree = await renderComponent();
    await pressGoogle(tree);

    expect(mockExchange).not.toHaveBeenCalled();
    expect(mockPersistTokens).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(snackbarText(tree)).toBeTruthy();
  });
});

describe('SocialSignIn — the paths that are not success', () => {
  it('says nothing when the shopper dismisses the browser', async () => {
    // Backing out is a decision, not a failure. An error toast here would tell
    // someone who changed their mind that something is broken.
    mockOpenAuthSession.mockResolvedValue({ type: 'dismiss' });

    const tree = await renderComponent();
    await pressGoogle(tree);

    expect(mockExchange).not.toHaveBeenCalled();
    expect(snackbarText(tree)).toBe('');
  });

  it('says nothing on an explicit cancel', async () => {
    mockOpenAuthSession.mockResolvedValue({ type: 'cancel' });

    const tree = await renderComponent();
    await pressGoogle(tree);

    expect(snackbarText(tree)).toBe('');
  });

  it('explains a deactivated account rather than blaming the provider', async () => {
    mockOpenAuthSession.mockResolvedValue({
      type: 'success',
      url: 'muni://auth/callback?reason=account_disabled',
    });

    const tree = await renderComponent();
    await pressGoogle(tree);

    expect(snackbarText(tree)).toMatch(/deactivated/i);
  });

  it('explains an unverified email, which is a refusal to link', async () => {
    mockOpenAuthSession.mockResolvedValue({
      type: 'success',
      url: 'muni://auth/callback?reason=unverified_email',
    });

    const tree = await renderComponent();
    await pressGoogle(tree);

    expect(snackbarText(tree)).toMatch(/could not confirm your email/i);
  });

  it('reports a failed exchange without starting a session', async () => {
    mockOpenAuthSession.mockResolvedValue({
      type: 'success',
      url: 'muni://auth/callback?code=stale-code',
    });
    mockExchange.mockRejectedValue(new Error('code expired'));

    const tree = await renderComponent();
    await pressGoogle(tree);

    expect(mockPersistTokens).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(snackbarText(tree)).toBeTruthy();
  });
});
