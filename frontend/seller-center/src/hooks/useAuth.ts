import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store/rootReducer';
import { loginThunk, logoutThunk, registerThunk, fetchCurrentUserThunk } from '../store/slices/authSlice';

export const useAuth = () => {
  const dispatch = useDispatch();
  const { user, status } = useSelector((state: RootState) => state.auth);
  const isAuthenticated = !!user;
  const isLoading = status === 'loading';

  const login = async (credentials: any) => {
    return await dispatch(loginThunk(credentials) as any);
  };

  const logout = async () => {
    return await dispatch(logoutThunk() as any);
  };

  const register = async (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phoneNumber?: string;
  }) => {
    return await dispatch(registerThunk(data) as any);
  };

  return { user, isAuthenticated, isLoading, login, logout, register };
};
