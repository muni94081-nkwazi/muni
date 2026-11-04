jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const mockSecureStore = {
  __esModule: true,
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
};
jest.mock('expo-secure-store', () => mockSecureStore);

const mockReplace = jest.fn();
const mockPush = jest.fn();
let mockParams: Record<string, string | undefined> = {};
jest.mock('expo-router', () => ({
  router: { replace: (...a: unknown[]) => mockReplace(...a), push: (...a: unknown[]) => mockPush(...a) },
  useLocalSearchParams: () => mockParams,
}));

const mockBegin = jest.fn();
const mockComplete = jest.fn();
jest.mock('@/api/mfa.api', () => ({
  mfaApi: {
    beginEnrolment: (...a: unknown[]) => mockBegin(...a),
    completeEnrolment: (...a: unknown[]) => mockComplete(...a),
  },
}));

// AuthScreen reads the safe-area inset, which needs a provider the renderer
// does not have.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// establishSessionThunk must never be reachable from this screen. Importing the
// real slice would pull in the whole store; standing it in lets the assertions
// below prove it is not dispatched.
const mockEstablishSession = jest.fn();
jest.mock('@/store/auth.slice', () => ({
  establishSessionThunk: (...a: unknown[]) => mockEstablishSession(...a),
}));

import React from 'react';
import { Linking } from 'react-native';
import { act, create, type TestInstance, type TestRenderer } from 'react-test-renderer';
import MfaSetupScreen from '../../../app/(auth)/mfa-setup';

/**
 * The mandatory-enrolment screen.
 *
 * A privileged account with no second factor could not sign in on mobile at
 * all: login routed MFA_ENROLLMENT_REQUIRED to the two-factor screen, which
 * could only say enrolment was unsupported and send the user to the web.
 *
 * The two properties worth protecting here are that enrolment never becomes a
 * session, and that the five-minute credential never leaves this screen's own
 * scope.
 */
const SETUP = {
  secret: 'JBSWY3DPEHPK3PXP',
  otpauthUrl: 'otpauth://totp/MUNI:seller@example.test?secret=JBSWY3DPEHPK3PXP',
  qrCodeInstructions: 'Scan otpauthUrl with Google Authenticator or Authy',
};

const axiosError = (status: number, data?: Record<string, unknown>) =>
  Object.assign(new Error(`HTTP ${status}`), {
    isAxiosError: true,
    response: { status, data },
  });

const networkError = () =>
  Object.assign(new Error('Network Error'), { isAxiosError: true, response: undefined });

async function render(): Promise<TestRenderer> {
  let tree!: TestRenderer;
  await act(async () => {
    tree = create(<MfaSetupScreen />);
  });
  await act(async () => { await Promise.resolve(); });
  return tree;
}

function byLabel(tree: TestRenderer, label: string): TestInstance | undefined {
  return tree.root.findAll((n: TestInstance) => n.props?.accessibilityLabel === label)[0];
}

async function press(node: TestInstance | undefined): Promise<void> {
  await act(async () => {
    (node?.props.onPress as () => void)?.();
  });
  await act(async () => { await Promise.resolve(); });
}

/** Type a code into the CodeInput, which auto-submits on the sixth digit. */
async function enterCode(tree: TestRenderer, code: string): Promise<void> {
  const input = tree.root.findAll(
    (n: TestInstance) => typeof n.props?.onChange === 'function' && n.props?.length === 6,
  )[0];
  await act(async () => {
    (input.props.onChange as (v: string) => void)(code);
  });
  await act(async () => { await Promise.resolve(); });
}

/** Every string rendered anywhere in the tree. */
function text(tree: TestRenderer): string {
  return JSON.stringify(tree.toJSON());
}

/** Spied rather than module-mocked: this is the Linking the screen imports. */
const mockOpenURL = jest.spyOn(Linking, 'openURL');

beforeEach(() => {
  jest.clearAllMocks();
  mockOpenURL.mockResolvedValue(undefined as never);
  mockParams = { enrollmentToken: 'enrol-token', redirect: '/(tabs)/profile' };
  mockBegin.mockResolvedValue(SETUP);
  mockComplete.mockResolvedValue(undefined);
});

describe('starting enrolment', () => {
  it('asks the backend for setup information, using the routed token', async () => {
    await render();

    expect(mockBegin).toHaveBeenCalledWith('enrol-token');
  });

  it('renders what the backend returned, and no invented secret', async () => {
    const tree = await render();
    await press(byLabel(tree, 'Show setup key'));

    expect(text(tree)).toContain(SETUP.secret);
  });

  it('keeps the setup key hidden until it is asked for', async () => {
    const tree = await render();

    // Setup often happens with someone else in the room; this key is the second
    // factor itself.
    expect(text(tree)).not.toContain(SETUP.secret);
    expect(byLabel(tree, 'Show setup key')).toBeDefined();
  });

  it('hands the otpauth URI to the authenticator app rather than rendering a QR', async () => {
    const tree = await render();
    await press(byLabel(tree, 'Open my authenticator app'));

    expect(mockOpenURL).toHaveBeenCalledWith(SETUP.otpauthUrl);
  });

  it('says the session expired on a 401, and does not ask for a code', async () => {
    mockBegin.mockRejectedValue(axiosError(401));

    const tree = await render();

    expect(text(tree)).toMatch(/expired/i);
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it('reports an already-enrolled account rather than looping', async () => {
    mockBegin.mockRejectedValue(
      axiosError(409, { message: 'Two-factor authentication is already enabled.' }),
    );

    const tree = await render();

    expect(text(tree)).toMatch(/already enabled/i);
  });

  it('offers a retry after a network failure', async () => {
    mockBegin.mockRejectedValueOnce(networkError()).mockResolvedValueOnce(SETUP);

    const tree = await render();
    expect(text(tree)).toMatch(/Cannot reach MUNI/i);

    await press(byLabel(tree, 'Try again') ?? tree.root.findAll(
      (n: TestInstance) => n.props?.children === 'Try again',
    )[0]);

    expect(mockBegin).toHaveBeenCalledTimes(2);
  });

  it('sends the user back to sign in when no token was routed at all', async () => {
    mockParams = {};

    const tree = await render();

    expect(mockBegin).not.toHaveBeenCalled();
    expect(text(tree)).toMatch(/expired/i);
  });
});

describe('finishing enrolment', () => {
  it('submits the code with the enrolment token', async () => {
    const tree = await render();
    await enterCode(tree, '123456');

    expect(mockComplete).toHaveBeenCalledWith('enrol-token', '123456');
  });

  it('returns to login instead of establishing a session', async () => {
    const tree = await render();
    await enterCode(tree, '123456');

    // The whole point: auth-service issues no tokens here, so the user signs in
    // again and takes the MFA_REQUIRED branch.
    expect(mockEstablishSession).not.toHaveBeenCalled();
    expect(mockSecureStore.setItemAsync).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/(auth)/login' }),
    );
  });

  it('carries the original destination through, so the user lands where they meant to', async () => {
    const tree = await render();
    await enterCode(tree, '123456');

    const [arg] = mockReplace.mock.calls[0] as [{ params?: Record<string, string> }];
    expect(arg.params?.redirect).toBe('/(tabs)/profile');
  });

  it('shows the attempts left on a wrong code, and stays put', async () => {
    mockComplete.mockRejectedValue(
      axiosError(400, { message: 'Invalid 2FA verification token', attemptsRemaining: 4 }),
    );

    const tree = await render();
    await enterCode(tree, '000000');

    expect(text(tree)).toMatch(/4 attempts left/i);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockEstablishSession).not.toHaveBeenCalled();
  });

  it('treats an expired challenge as a restart, not a success', async () => {
    mockComplete.mockRejectedValue(axiosError(401));

    const tree = await render();
    await enterCode(tree, '123456');

    expect(text(tree)).toMatch(/expired/i);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('reports a lockout without creating a session', async () => {
    mockComplete.mockRejectedValue(
      axiosError(429, { message: 'Too many attempts. Try again later.' }),
    );

    const tree = await render();
    await enterCode(tree, '123456');

    expect(text(tree)).toMatch(/Too many attempts/i);
    expect(mockEstablishSession).not.toHaveBeenCalled();
  });

  it('keeps the user on the screen when the network fails', async () => {
    mockComplete.mockRejectedValue(networkError());

    const tree = await render();
    await enterCode(tree, '123456');

    expect(text(tree)).toMatch(/Cannot reach MUNI/i);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('does not fire a second request while one is in flight', async () => {
    let release: () => void = () => {};
    mockComplete.mockReturnValue(new Promise<void>((resolve) => { release = resolve; }));

    const tree = await render();
    await enterCode(tree, '123456');
    await enterCode(tree, '123456');

    // The code is burned server-side on first use, so a duplicate would fail
    // with "already used" and look like a wrong code to the user.
    expect(mockComplete).toHaveBeenCalledTimes(1);
    await act(async () => { release(); });
  });
});
