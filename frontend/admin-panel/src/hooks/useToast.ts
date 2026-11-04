import { useCallback } from 'react';
import { useAppDispatch } from '@/store/hooks/useAppSelector';
import { addToast } from '@/store/slices/uiSlice';

export function useToast() {
  const dispatch = useAppDispatch();
  const show = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    dispatch(addToast({ message, type }));
  }, [dispatch]);
  return { show };
}
