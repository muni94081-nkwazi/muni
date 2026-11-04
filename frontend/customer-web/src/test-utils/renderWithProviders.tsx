import { render, type RenderResult } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';
import { rootReducer, type RootState } from '@/store/rootReducer';
import type { User, UserRole } from '@/types/user.types';

/**
 * Renders a component inside the two providers every shared component assumes:
 * the Redux store (useAuth, useCurrency, toasts) and a router (Link,
 * useNavigate). Built on the real rootReducer, so tests exercise the same
 * selectors production does.
 */
export function renderWithProviders(
  ui: ReactElement,
  { preloadedState, route = '/' }: { preloadedState?: Partial<RootState>; route?: string } = {},
): RenderResult & { store: ReturnType<typeof configureStore> } {
  const store = configureStore({
    reducer: rootReducer,
    preloadedState: preloadedState as never,
  });

  const result = render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </Provider>,
  );

  return { ...result, store };
}

export function makeUser(roles: UserRole[] = ['ROLE_CUSTOMER']): User {
  return {
    id: 'user-1',
    firstName: 'Ada',
    lastName: 'Nakato',
    fullName: 'Ada Nakato',
    email: 'ada@example.com',
    phoneNumber: null,
    profilePictureUrl: null,
    active: true,
    emailVerified: true,
    phoneVerified: false,
    roles,
    lastLoginAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

export function signedIn(roles: UserRole[] = ['ROLE_CUSTOMER']): Partial<RootState> {
  return {
    auth: { user: makeUser(roles), isAuthenticated: true, status: 'succeeded', error: null },
  };
}

export function signedOut(): Partial<RootState> {
  return { auth: { user: null, isAuthenticated: false, status: 'idle', error: null } };
}

/** Preloaded currency slice, so tests don't depend on a rates fetch resolving. */
export function withCurrency(
  marketCode = 'UG',
  displayCurrency = 'UGX',
  rates: Record<string, number> = { USD: 1, UGX: 3800, KES: 130 },
): Partial<RootState> {
  return {
    currency: {
      marketCode,
      displayCurrency,
      rates,
      base: 'USD',
      status: 'succeeded',
      stale: false,
      error: null,
    },
  };
}

/**
 * Stubs `window.matchMedia`, which jsdom does not implement. `matches` is
 * decided by the predicate, so a test can put the footer on the mobile
 * breakpoint (columns become an accordion) or the desktop one (permanently
 * expanded).
 */
export function stubMatchMedia(matches: (query: string) => boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: matches(query),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
