import { useCallback, useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks/useAppSelector';
import {
  clearFinanceError,
  fetchEarningsThunk,
  fetchTransactionsThunk,
  fetchWithdrawalsThunk,
  requestWithdrawalThunk,
} from '../store/slices/financeSlice';
import type { WithdrawalRequest } from '../api/finance.api';

export function useFinance() {
  const dispatch = useAppDispatch();
  const { earnings, transactions, transactionsMeta, withdrawals, loading, requesting, error } =
    useAppSelector((s) => s.finance);

  const refresh = useCallback(() => {
    dispatch(fetchEarningsThunk());
    dispatch(fetchTransactionsThunk(1));
    dispatch(fetchWithdrawalsThunk());
  }, [dispatch]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const requestWithdrawal = useCallback(
    async (request: WithdrawalRequest) => {
      const created = await dispatch(requestWithdrawalThunk(request)).unwrap();
      // Refetch rather than trust the optimistic adjustment: payment-service is
      // the authority on the balance, and a stale figure here is what lets a
      // seller queue a second withdrawal the backend will refuse.
      dispatch(fetchEarningsThunk());
      return created;
    },
    [dispatch],
  );

  return {
    earnings,
    transactions,
    transactionsMeta,
    withdrawals,
    isLoading: loading,
    isRequesting: requesting,
    error,
    refresh,
    requestWithdrawal,
    clearError: () => dispatch(clearFinanceError()),
  };
}
