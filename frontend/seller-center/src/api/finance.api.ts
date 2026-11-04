import axiosInstance from './axios.config';
import type {
  Earnings,
  FinancePageMeta,
  FinanceTransaction,
  TransactionType,
  Withdrawal,
  WithdrawalDestination,
  WithdrawalMethod,
  WithdrawalStatus,
} from '../types/finance.types';

// ─── Seller Finance API ───────────────────────────────────────────────────────
//
// Calls /api/v1/seller/finance, which the gateway gates with
// requireRole('ROLE_SELLER', …) and proxies to payment-service. The seller is
// identified by the gateway-stamped x-user-id, and payment-service scopes every
// query to it — no vendor id is sent from here.
//
// This replaced a module of hardcoded balances that silently fell back to mock
// figures whenever the real call failed, so a broken backend looked like a
// healthy one with UGX 2,850,000 in the bank.

export interface TransactionPage {
  data: FinanceTransaction[];
  meta: FinancePageMeta;
}

export interface WithdrawalPage {
  data: Withdrawal[];
  meta: FinancePageMeta;
}

export interface WithdrawalRequest {
  amount: number;
  method: WithdrawalMethod;
  destinationAccount: WithdrawalDestination;
}

export const financeApi = {
  /** Balances and lifetime totals for the seller's own account. */
  getEarnings: async (): Promise<Earnings> => {
    const { data } = await axiosInstance.get<{ data: Earnings }>('/seller/finance/earnings');
    return data.data;
  },

  /** Order credits and withdrawals in one feed, newest first. */
  listTransactions: async (page = 1, perPage = 20, type?: TransactionType): Promise<TransactionPage> => {
    const { data } = await axiosInstance.get('/seller/finance/transactions', {
      params: { page, per_page: perPage, type: type || undefined },
    });
    return { data: data.data, meta: data.meta };
  },

  /**
   * Queue a withdrawal against the available balance.
   *
   * Comes back as `pending`: payment-service reserves the funds immediately but
   * an admin has to approve before anything is disbursed. Rejects with 400 if
   * the amount is below the minimum or exceeds the available balance.
   */
  requestWithdrawal: async (request: WithdrawalRequest): Promise<Withdrawal> => {
    const { data } = await axiosInstance.post<{ data: Withdrawal }>('/seller/finance/withdrawals', request);
    return data.data;
  },

  listWithdrawals: async (page = 1, perPage = 20, status?: WithdrawalStatus): Promise<WithdrawalPage> => {
    const { data } = await axiosInstance.get('/seller/finance/withdrawals', {
      params: { page, per_page: perPage, status: status || undefined },
    });
    return { data: data.data, meta: data.meta };
  },
};
