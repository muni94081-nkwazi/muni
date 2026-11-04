import { useCallback, useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks/useAppSelector';
import {
  clearAuthError,
  fetchCurrentUser,
  login as loginThunk,
  logout as logoutThunk,
  register as registerThunk,
} from '@/store/slices/authSlice';
import type { LoginPayload, RegisterPayload } from '@/types/user.types';
import { ACCESS_TOKEN_KEY } from '@/utils/constants';
import { safeGetItem } from '@/utils/helpers';

/**
 * Central auth hook. Pages/components should use this rather than
 * dispatching auth thunks directly, so the "do we already have a
 * token but no user loaded yet" bootstrap logic lives in one place.
 */
export function useAuth() {
  const dispatch = useAppDispatch();
  const { user, isAuthenticated, status, error } = useAppSelector((state) => state.auth);

  useEffect(() => {
    if (isAuthenticated && !user && safeGetItem(ACCESS_TOKEN_KEY)) {
      dispatch(fetchCurrentUser());
    }
  }, [dispatch, isAuthenticated, user]);

  const login = useCallback(
    (payload: LoginPayload) => dispatch(loginThunk(payload)).unwrap(),
    [dispatch],
  );

  const register = useCallback(
    (payload: RegisterPayload) => dispatch(registerThunk(payload)).unwrap(),
    [dispatch],
  );

  const logout = useCallback(() => dispatch(logoutThunk()).unwrap(), [dispatch]);

  const clearError = useCallback(() => dispatch(clearAuthError()), [dispatch]);

  const hasRole = useCallback(
    (role: string) => Boolean(user?.roles.includes(role as never)),
    [user],
  );

  // Social sign-in lives in useSocialSignIn, not here: it has to consult
  // GET /auth/providers before navigating, so an unconfigured provider says so
  // rather than sending the window to an error page.

  return {
    user,
    isAuthenticated,
    isLoading: status === 'loading',
    error,
    login,
    register,
    logout,
    clearError,
    hasRole,
    isAdmin: hasRole('ROLE_ADMIN') || hasRole('ROLE_SUPER_ADMIN'),
    // ROLE_SELLER is the role auth-service actually grants on seller approval.
    // This asked for ROLE_VENDOR, which no account has ever held, so it was
    // permanently false. `isVendor` is kept as an alias so existing call sites
    // keep resolving.
    isSeller: hasRole('ROLE_SELLER'),
    isVendor: hasRole('ROLE_SELLER'),
  };
}
