import { useCallback, useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks/useAppSelector';
import {
  approveWithdrawalThunk,
  clearFinanceError,
  fetchFinanceSummaryThunk,
  fetchWithdrawalsThunk,
  rejectWithdrawalThunk,
} from '@/store/slices/financeSlice';
import type { WithdrawalFilters } from '@/api/finance.api';

export function useFinance(filters: WithdrawalFilters = {}) {
  const dispatch = useAppDispatch();
  const { summary, withdrawals, meta, loading, actioningId, error } = useAppSelector((s) => s.finance);

  const { status, sellerId } = filters;

  const loadAll = useCallback(() => {
    dispatch(fetchFinanceSummaryThunk());
    dispatch(fetchWithdrawalsThunk({ status, sellerId }));
  }, [dispatch, status, sellerId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const approve = useCallback(
    (id: string) => dispatch(approveWithdrawalThunk(id)).unwrap(),
    [dispatch],
  );

  const reject = useCallback(
    (id: string, reason: string) => dispatch(rejectWithdrawalThunk({ id, reason })).unwrap(),
    [dispatch],
  );

  // Approving moves money out of escrow, so the summary tiles are stale the
  // moment a decision lands. Refresh them rather than adjusting locally, which
  // would drift from what payment-service actually recorded.
  const refreshSummary = useCallback(() => {
    dispatch(fetchFinanceSummaryThunk());
  }, [dispatch]);

  return {
    summary,
    withdrawals,
    meta,
    isLoading: loading,
    actioningId,
    error,
    loadAll,
    refreshSummary,
    approve,
    reject,
    clearError: () => dispatch(clearFinanceError()),
  };
}
