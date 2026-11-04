import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { LoadingState } from '@/components/common/LoadingState';

export interface PrivateRouteProps {
  children: ReactNode;
  requireRole?: string;
}

export function PrivateRoute({ children, requireRole }: PrivateRouteProps) {
  const { isAuthenticated, isLoading, hasRole, user } = useAuth();
  const location = useLocation();

  // Brief loading state covers the moment we have a token but haven't
  // yet resolved /users/me (see useAuth's bootstrap effect) — without
  // this we'd flash a redirect to /login before the user loads.
  if (isLoading && !user) {
    return <LoadingState />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requireRole && !hasRole(requireRole)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
