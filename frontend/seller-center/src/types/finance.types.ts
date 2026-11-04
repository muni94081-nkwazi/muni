// ─── Seller finance ───────────────────────────────────────────────────────────
//
// Mirrors payment-service's /api/v1/seller/finance/* responses, which are built
// from its VendorBalance, VendorLedgerEntry and VendorPayout models.

/**
 * A seller's money position, split by how far each shilling has cleared.
 *
 * The three balances are disjoint — money is in exactly one of them:
 *   pending   the buyer paid, but the sub-order has not been delivered yet
 *   available delivered and released; this is what can be withdrawn
 *   reserved  committed to a withdrawal that is awaiting review or in flight
 */
export interface Earnings {
  currency: string;
  availableBalance: number;
  pendingBalance: number;
  reservedBalance: number;
  /** Value of withdrawals that have actually reached the seller. */
  totalWithdrawn: number;
  /** Gross sales before the platform's cut. */
  lifetimeSales: number;
  /** What the platform kept — `lifetimeSales - totalEarnings`. */
  platformCommission: number;
  /** Net lifetime earnings after commission. */
  totalEarnings: number;
  /** Number of sub-orders credited to this seller. */
  orderCount: number;
}

export type TransactionType = 'credit' | 'payout';

/**
 * One line of the seller's statement.
 *
 * `amount` is signed: a credit is positive (the seller's share of a sub-order),
 * a payout is negative (money leaving the balance), so a running total over the
 * feed works without special-casing the type.
 */
export interface FinanceTransaction {
  id: string;
  type: TransactionType;
  amount: number;
  /** The order's gross value for a credit; the requested amount for a payout. */
  grossAmount: number;
  platformFee: number;
  /** Ledger status for a credit, withdrawal status for a payout. */
  status: string;
  orderId: string | null;
  subOrderId: string | null;
  reference: string;
  createdAt: string;
}

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
  /** The admin's reason, shown to the seller verbatim when a request is declined. */
  rejectionReason: string | null;
}

export interface FinancePageMeta {
  total: number;
  page: number;
  perPage: number;
}

/** payment-service refuses anything below this. Mirrored here so the form can say so first. */
export const MINIMUM_WITHDRAWAL_AMOUNT = 50_000;
