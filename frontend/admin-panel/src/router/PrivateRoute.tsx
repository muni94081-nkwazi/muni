import { Navigate, Outlet } from 'react-router-dom';
import { useAppSelector } from '../store/hooks/useAppSelector';

export function PrivateRoute() {
  const { isAuthenticated, user } = useAppSelector((state) => state.auth);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user && !user.roles.some((r) => r === 'ROLE_ADMIN' || r === 'ROLE_SUPER_ADMIN')) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <Outlet />;
}
