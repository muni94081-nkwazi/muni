// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// ─── A signed-in shopper can sign out ─────────────────────────────────────────
//
// `logout` existed at every layer — authApi.logout(), the authSlice thunk that
// clears both tokens even when the server call fails, and useAuth's wrapper —
// and had unit tests. What it did not have was a caller: the only "Sign out"
// button in customer-web was in AdminLayout, which a shopper never sees. So a
// customer who signed in on a shared device could not sign out of it.

const logoutMock = vi.fn(() => Promise.resolve());
const navigateMock = vi.fn();

let authState = { isAuthenticated: true, user: { firstName: 'Amina' }, isAdmin: false };

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ ...authState, logout: logoutMock }),
}));
vi.mock('@/hooks/useCart', () => ({ useCart: () => ({ cart: { totalUnits: 0 } }) }));
vi.mock('../../CategoryNav/CategoryNav', () => ({ CategoryNav: () => null }));
vi.mock('@/store/hooks/useAppSelector', () => ({
  useAppDispatch: () => vi.fn(),
  useAppSelector: () => false,
}));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const { Navbar } = await import('../Navbar');

const renderNavbar = () =>
  render(
    <MemoryRouter>
      <Navbar />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  authState = { isAuthenticated: true, user: { firstName: 'Amina' }, isAdmin: false };
});

describe('sign out', () => {
  it('offers a sign-out control to a signed-in shopper', () => {
    renderNavbar();
    expect(screen.getByRole('button', { name: /sign out/i })).toBeTruthy();
  });

  it('does not offer one to a visitor who is not signed in', () => {
    authState = { isAuthenticated: false, user: null as never, isAdmin: false };
    renderNavbar();
    expect(screen.queryByRole('button', { name: /sign out/i })).toBeNull();
  });

  it('ends the session and leaves the signed-in area', async () => {
    renderNavbar();
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }));

    await waitFor(() => expect(logoutMock).toHaveBeenCalledTimes(1));
    expect(navigateMock).toHaveBeenCalledWith('/');
  });

  it('still leaves the signed-in area when the server call fails', async () => {
    // An expired or already-revoked session must still let go on this device.
    logoutMock.mockRejectedValueOnce(new Error('already expired'));
    renderNavbar();

    await userEvent.click(screen.getByRole('button', { name: /sign out/i }));

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/'));
  });
});
