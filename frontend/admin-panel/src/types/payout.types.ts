// ─── Platform finance ─────────────────────────────────────────────────────────
//
// Mirrors payment-service's VendorPayout model and its /api/v1/admin/finance/*
// responses.

/**
 * pending → processing → completed | failed, or pending → rejected.
 *
 * `failed` and `rejected` are both terminal but mean different things: the
 * provider refused the transfer, versus an admin declined to send it. Both
 * return the reserved funds to the seller's available balance.
 */
export type WithdrawalStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'rejected';

export type WithdrawalMethod = 'mobile_money' | 'bank_transfer';

export interface WithdrawalDestination {
  accountNumber: string;
  accountName: string;
  /** 'MTN' | 'AIRTEL' for mobile money; a bank code for transfers. */
  bankCode?: string;
}

export interface Withdrawal {
  id: string;
  vendorId: string;
  amount: number;
  currency: string;
  method: WithdrawalMethod;
  destinationAccount: WithdrawalDestination;
  status: WithdrawalStatus;
  reference: string;
  requestedBy: 'seller' | 'system_scheduled';
  createdAt: string;
  updatedAt: string;
  processedAt: string | null;
  failureReason: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
}

export interface EscrowSummary {
  totalEscrowEntries: number;
  activeEscrowHoldUGX: number;
  disputeHoldUGX: number;
  releasedUGX: number;
  refundedUGX: number;
}

export interface FinanceSummary {
  currency: string;
  /** Commission the platform has actually recorded against settled sub-orders. */
  platformCommissionEarned: number;
  totalPayoutsDisbursed: number;
  /** Value committed to withdrawals that are pending or in flight. */
  pendingWithdrawalValue: number;
  escrow: EscrowSummary;
}

export interface PageMeta {
  total: number;
  page: number;
  perPage: number;
}
