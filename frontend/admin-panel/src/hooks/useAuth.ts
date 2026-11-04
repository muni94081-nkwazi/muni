import { useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks/useAppSelector';
import { loginThunk, logoutThunk } from '@/store/slices/authSlice';

export function useAuth() {
  const dispatch = useAppDispatch();
  const { user, isAuthenticated, loading, error } = useAppSelector((s) => s.auth);

  const loginFn = useCallback(async (email: string, password: string) => {
    return dispatch(loginThunk({ email, password })).unwrap();
  }, [dispatch]);

  const logoutFn = useCallback(async () => {
    return dispatch(logoutThunk()).unwrap();
  }, [dispatch]);

  return { user, isAuthenticated, isLoading: loading, error, login: loginFn, logout: logoutFn };
}
