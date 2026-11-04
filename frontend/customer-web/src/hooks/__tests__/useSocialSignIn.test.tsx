// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import type { ReactNode } from 'react';

// ─── A provider with no credentials says so, before it is clicked ─────────────
//
// auth-service reports `enabled: false` for every provider it has no
// credentials for, and all three are unconfigured in a fresh clone. The
// buttons still rendered as though they worked, and the only feedback was a
// toast — after the click — saying the method was "temporarily unavailable".
// Nothing is temporary about a credential that was never issued.

const listMock = vi.fn();
vi.mock('@/api/authProviders.api', async () => {
  const actual = await vi.importActual<typeof import('@/api/authProviders.api')>(
    '@/api/authProviders.api',
  );
  return { ...actual, authProvidersApi: { list: listMock } };
});

const { useSocialSignIn, providerUnavailableMessage } = await import('../useSocialSignIn');
const { PROVIDER_CATALOGUE } = await import('@/api/authProviders.api');
const uiReducer = (await import('@/store/slices/uiSlice')).default;

const provider = (name: string, enabled: boolean) => ({
  name,
  enabled,
  loginUrl: `/api/v1/auth/${name}`,
  displayName: `Continue with ${name[0].toUpperCase()}${name.slice(1)}`,
});

function wrapper({ children }: { children: ReactNode }) {
  const store = configureStore({ reducer: { ui: uiReducer } });
  return <Provider store={store}>{children}</Provider>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('availability is known before the click', () => {
  it('reports an unconfigured provider as unavailable once discovery answers', async () => {
    listMock.mockResolvedValue([provider('google', false), provider('apple', true)]);

    const { result } = renderHook(() => useSocialSignIn(), { wrapper });

    await waitFor(() => expect(result.current.isUnavailable('google')).toBe(true));
    expect(result.current.isUnavailable('apple')).toBe(false);
  });

  it('does not flash every button disabled while discovery is in flight', () => {
    // The catalogue's placeholder is `enabled: false`. Judging the buttons
    // against it before the answer arrives would render all three disabled on
    // mount and then enable them a moment later.
    listMock.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useSocialSignIn(), { wrapper });

    expect(result.current.isUnavailable('google')).toBe(false);
    expect(result.current.isUnavailable('apple')).toBe(false);
  });

  it('treats a failed lookup as unavailable rather than pretending it works', async () => {
    // authProvidersApi.list never throws: a failed lookup degrades to the
    // catalogue, where every provider carries the placeholder `enabled: false`.
    // That is the state the buttons must reflect — a gateway this client
    // cannot reach is not one it can complete a handshake through either.
    listMock.mockResolvedValue(PROVIDER_CATALOGUE);

    const { result } = renderHook(() => useSocialSignIn(), { wrapper });

    await waitFor(() => expect(result.current.isUnavailable('google')).toBe(true));
    expect(result.current.isUnavailable('apple')).toBe(true);
    expect(result.current.isUnavailable('facebook')).toBe(true);
  });
});

describe('clicking an unconfigured provider', () => {
  it('does not navigate the window at a provider that cannot answer', async () => {
    listMock.mockResolvedValue([provider('google', false)]);
    const assign = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { assign, href: 'http://localhost/login' },
      writable: true,
    });

    const { result } = renderHook(() => useSocialSignIn(), { wrapper });
    await waitFor(() => expect(result.current.isUnavailable('google')).toBe(true));
    await act(async () => { await result.current.start('google'); });

    expect(assign).not.toHaveBeenCalled();
  });

  it('navigates for a provider that is configured', async () => {
    listMock.mockResolvedValue([provider('google', true)]);
    const assign = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { assign, href: 'http://localhost/login' },
      writable: true,
    });

    const { result } = renderHook(() => useSocialSignIn(), { wrapper });
    await waitFor(() => expect(result.current.isUnavailable('google')).toBe(false));
    await act(async () => { await result.current.start('google'); });

    expect(assign).toHaveBeenCalledWith('/api/v1/auth/google');
  });
});

describe('the message it gives', () => {
  it('does not call an unissued credential a temporary outage', () => {
    const message = providerUnavailableMessage('Google');
    expect(message).not.toMatch(/temporar/i);
  });

  it('names the provider and points at the way in that works', () => {
    const message = providerUnavailableMessage('Google');
    expect(message).toMatch(/Google/);
    expect(message).toMatch(/email and password/i);
  });
});
