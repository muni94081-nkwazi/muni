import { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { ROUTES } from './routes';
import { safeGetItem, ACCESS_TOKEN_KEY } from '../utils/constants';
import { useAppDispatch, useAppSelector } from '../store/hooks/useAppSelector';
import { fetchCurrentUserThunk, selectUser } from '../store/slices/authSlice';

export const PrivateRoute = () => {
  const dispatch = useAppDispatch();
  const token = safeGetItem(ACCESS_TOKEN_KEY);
  const user = useAppSelector(selectUser);

  // A page refresh restores the token from localStorage immediately, but the
  // role-carrying `user` object only exists after the login response — without
  // this, the ROLE_SELLER check below would have nothing to check on refresh.
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

  if (!user.roles.includes('ROLE_SELLER')) {
    return <Navigate to={ROUTES.UNAUTHORIZED} replace />;
  }

  return <Outlet />;
};
