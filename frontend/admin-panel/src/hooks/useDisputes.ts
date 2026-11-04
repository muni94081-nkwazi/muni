import { useEffect, useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks/useAppSelector';
import { fetchDisputesThunk, resolveDisputeThunk } from '@/store/slices/disputeSlice';

export function useDisputes() {
  const dispatch = useAppDispatch();
  const { disputes, loading } = useAppSelector((s) => s.disputes);

  useEffect(() => { dispatch(fetchDisputesThunk({})); }, [dispatch]);

  const resolve = useCallback((disputeId: string, resolution: string, notes: string) => {
    return dispatch(resolveDisputeThunk({ disputeId, resolution, notes })).unwrap();
  }, [dispatch]);

  return { disputes, isLoading: loading, error: null, resolve, refetch: () => dispatch(fetchDisputesThunk({})) };
}
