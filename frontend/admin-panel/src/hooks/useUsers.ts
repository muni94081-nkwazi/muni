import { useEffect, useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks/useAppSelector';
import { fetchUsersThunk, updateUserStatusThunk } from '@/store/slices/userSlice';

export function useUsers() {
  const dispatch = useAppDispatch();
  const { users, loading } = useAppSelector((s) => s.users);

  useEffect(() => { dispatch(fetchUsersThunk({})); }, [dispatch]);

  const updateStatus = useCallback((userId: string, newStatus: string) => {
    return dispatch(updateUserStatusThunk({ userId, status: newStatus })).unwrap();
  }, [dispatch]);

  return { users, isLoading: loading, error: null, updateStatus, refetch: () => dispatch(fetchUsersThunk({})) };
}
