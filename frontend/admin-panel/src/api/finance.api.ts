import { apiClient } from './axios.config';
import type { FinanceSummary, PageMeta, Withdrawal, WithdrawalStatus } from '@/types/payout.types';

// ─── Admin Finance API ────────────────────────────────────────────────────────
//
// Calls /api/v1/admin/finance/*, gated at the gateway by
// requireRole('ROLE_ADMIN', 'ROLE_SUPER_ADMIN') and proxied to payment-service.
// The admin's identity is stamped as x-user-id from the verified JWT and is
// what payment-service records in VendorPayout.reviewedBy — nothing is sent
// from here.

export interface WithdrawalPage {
  data: Withdrawal[];
  meta: PageMeta;
}

export interface WithdrawalFilters {
  status?: WithdrawalStatus;
  /** Narrows to one seller's requests. */
  sellerId?: string;
}

export const financeApi = {
  /**
   * Settlement totals for the financials header.
   *
   * Scoped to what payment-service owns: commission recorded, payouts sent,
   * escrow held. Platform GMV comes from the dashboard stats endpoint instead —
   * order-service owns it, and sourcing one number from two places is how two
   * different numbers happen.
   */
  getSummary: async (): Promise<FinanceSummary> => {
    const { data } = await apiClient.get<{ data: FinanceSummary }>('/admin/finance/summary');
    return data.data;
  },

  /** The withdrawal queue. Defaults to every status, newest first. */
  listWithdrawals: async (
    page = 1,
    perPage = 20,
    filters: WithdrawalFilters = {},
  ): Promise<WithdrawalPage> => {
    const { data } = await apiClient.get('/admin/finance/withdrawals', {
      params: {
        page,
        per_page: perPage,
        status: filters.status || undefined,
        seller_id: filters.sellerId || undefined,
      },
    });
    return { data: data.data, meta: data.meta };
  },

  /**
   * Approve and disburse. payment-service moves the request to `processing`,
   * calls the mobile money provider, then settles it to `completed` or `failed`
   * — so the row that comes back may already be in a terminal state.
   *
   * Rejects with 409 if another admin actioned it first.
   */
  approve: async (id: string): Promise<Withdrawal> => {
    const { data } = await apiClient.post<{ data: Withdrawal }>(`/admin/finance/withdrawals/${id}/approve`);
    return data.data;
  },

  // payment-service requires a reason on reject — it is what the seller is
  // shown, so there is no reasonless variant of this call.
  reject: async (id: string, reason: string): Promise<Withdrawal> => {
    const { data } = await apiClient.post<{ data: Withdrawal }>(
      `/admin/finance/withdrawals/${id}/reject`,
      { reason },
    );
    return data.data;
  },
};
