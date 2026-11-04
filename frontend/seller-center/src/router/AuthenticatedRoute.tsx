import { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { ROUTES } from './routes';
import { safeGetItem, ACCESS_TOKEN_KEY } from '../utils/constants';
import { useAppDispatch, useAppSelector } from '../store/hooks/useAppSelector';
import { fetchCurrentUserThunk, selectUser } from '../store/slices/authSlice';

/**
 * Signed in, but not necessarily a seller.
 *
 * PrivateRoute requires ROLE_SELLER, and that role is granted only when an
 * admin approves a seller profile. That left a gap the onboarding flow falls
 * straight into: a customer who has just created an account has ROLE_CUSTOMER,
 * so every guarded route bounced them to /unauthorized — including the page
 * where they would apply to become a seller.
 *
 * This guard is the deliberate middle ground: it proves who the caller is and
 * nothing more. It grants no seller capability, and the pages behind it must
 * not assume any. Access to actual seller functionality still goes through
 * PrivateRoute, whose role check is unchanged.
 */
export const AuthenticatedRoute = () => {
  const dispatch = useAppDispatch();
  const token = safeGetItem(ACCESS_TOKEN_KEY);
  const user = useAppSelector(selectUser);

  // Same reason as PrivateRoute: a refresh restores the token synchronously but
  // the user object only arrives with the login response, so it is re-fetched.
  useEffect(() => {
    if (token && !user) {
      dispatch(fetchCurrentUserThunk());
    }
  }, [dispatch, token, user]);

  if (!token) {
    return <Navigate to={ROUTES.LOGIN} replace />;
  }

  if (!user) {
    return null; // brief flash while fetchCurrentUserThunk resolves
  }

  return <Outlet />;
};
