import type { Request, Response } from 'express';
import { paymentSplitService } from '../services/split.service.js';
import { vendorPayoutService } from '../services/payout.service.js';
import { escrowService } from '../services/escrow.service.js';
import type { PayoutMethod, PayoutStatus } from '../models/payment.model.js';

// ─── Finance API ──────────────────────────────────────────────────────────────
//
// Seller routes are scoped by the gateway-stamped x-user-id — never by a vendor
// id in the body or query, which a seller could set to someone else's. Admin
// routes are unscoped by design and are gated upstream by the gateway's
// requireRole('ROLE_ADMIN', 'ROLE_SUPER_ADMIN').

function sellerIdOf(req: Request, res: Response): string | null {
  const sellerId = res.locals.userId as string | undefined;
  if (!sellerId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return null;
  }
  return sellerId;
}

function adminIdOf(req: Request, res: Response): string | null {
  const adminId = res.locals.userId as string | undefined;
  if (!adminId) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return null;
  }
  return adminId;
}

function fail(res: Response, error: unknown): void {
  const status = (error as { status?: number }).status ?? 500;
  res.status(status).json({ success: false, message: (error as Error).message });
}

function pagination(req: Request): { page: number; perPage: number } {
  const page = Math.max(1, parseInt((req.query.page as string) ?? '1', 10) || 1);
  const perPage = Math.min(100, Math.max(1, parseInt((req.query.per_page as string) ?? '20', 10) || 20));
  return { page, perPage };
}

const PAYOUT_STATUSES: PayoutStatus[] = ['pending', 'processing', 'completed', 'failed', 'rejected'];

function parseStatus(raw: unknown): PayoutStatus | undefined {
  return PAYOUT_STATUSES.includes(raw as PayoutStatus) ? (raw as PayoutStatus) : undefined;
}

// ─── Seller ───────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/seller/finance/earnings
 *
 * `availableBalance` is cleared money — the sub-order was delivered and the
 * funds released. `pendingBalance` is credited but not yet withdrawable.
 * `reservedBalance` is already committed to a withdrawal awaiting review, and
 * is deliberately reported separately: it has left the available figure, and a
 * seller who cannot see where it went assumes the money vanished.
 */
export async function getSellerEarnings(req: Request, res: Response): Promise<void> {
  const sellerId = sellerIdOf(req, res);
  if (!sellerId) return;

  try {
    const [balance, totals, payoutTotals] = await Promise.all([
      paymentSplitService.getVendorBalance(sellerId),
      paymentSplitService.getVendorLifetimeTotals(sellerId),
      vendorPayoutService.getPayoutTotals(sellerId),
    ]);

    const { reserved: reservedBalance, disbursed: totalWithdrawn } = payoutTotals;

    res.json({
      success: true,
      data: {
        currency:            balance.currency,
        availableBalance:    balance.availableBalance,
        pendingBalance:      balance.pendingBalance,
        reservedBalance,
        totalWithdrawn,
        // Gross sales before the platform's cut, and the net after it. Both are
        // shown because a seller comparing the two is how commission stays
        // visible rather than an unexplained gap.
        lifetimeSales:       totals.lifetimeSales,
        platformCommission:  totals.lifetimeCommission,
        totalEarnings:       totals.lifetimeNetEarnings,
        orderCount:          totals.orderCount,
      },
    });
  } catch (error) {
    fail(res, error);
  }
}

/**
 * GET /api/v1/seller/finance/transactions
 *
 * One combined feed of order credits and withdrawals, newest first — which is
 * how a seller reads a statement. Each side is paged in the database, then
 * merged, so `meta.total` counts both.
 */
export async function listSellerTransactions(req: Request, res: Response): Promise<void> {
  const sellerId = sellerIdOf(req, res);
  if (!sellerId) return;

  const { page, perPage } = pagination(req);
  const type = req.query.type as string | undefined;

  try {
    const wantsCredits = type !== 'payout';
    const wantsPayouts = type !== 'credit';

    const [ledger, payouts] = await Promise.all([
      wantsCredits
        ? paymentSplitService.getVendorLedger(sellerId, { page, perPage })
        : Promise.resolve({ data: [], total: 0 }),
      wantsPayouts
        ? vendorPayoutService.listPayouts({ vendorId: sellerId, page, perPage })
        : Promise.resolve({ data: [], total: 0 }),
    ]);

    const credits = ledger.data.map((entry) => ({
      id:          entry.id,
      type:        'credit' as const,
      // A credit is worth the seller's share, not the gross — the gross is
      // carried alongside so the commission line is derivable, not guessed.
      amount:      entry.netVendorAmount,
      grossAmount: entry.grossAmount,
      platformFee: entry.platformFee,
      status:      entry.status,
      orderId:     entry.orderId,
      subOrderId:  entry.subOrderId ?? null,
      reference:   entry.transactionId,
      createdAt:   entry.createdAt,
    }));

    const debits = payouts.data.map((payout) => ({
      id:          payout.id,
      type:        'payout' as const,
      // Negative: a withdrawal moves money out of the seller's balance, and a
      // running total over this feed should reflect that without the consumer
      // having to know which types to subtract.
      amount:      -payout.amount,
      grossAmount: payout.amount,
      platformFee: 0,
      status:      payout.status,
      orderId:     null,
      subOrderId:  null,
      reference:   payout.reference,
      createdAt:   payout.createdAt,
    }));

    const data = [...credits, ...debits].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    res.json({
      data,
      meta: { total: ledger.total + payouts.total, page, perPage },
    });
  } catch (error) {
    fail(res, error);
  }
}

/** POST /api/v1/seller/finance/withdrawals — queue a withdrawal for admin review. */
export async function requestWithdrawal(req: Request, res: Response): Promise<void> {
  const sellerId = sellerIdOf(req, res);
  if (!sellerId) return;

  const { amount, method, destinationAccount } = req.body as {
    amount?: number | string;
    method?: PayoutMethod;
    destinationAccount?: { accountNumber?: string; accountName?: string; bankCode?: string };
  };

  const parsedAmount = Number(amount);
  if (!parsedAmount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
    res.status(400).json({ success: false, message: 'A positive amount is required' });
    return;
  }
  if (method !== 'mobile_money' && method !== 'bank_transfer') {
    res.status(400).json({ success: false, message: "method must be 'mobile_money' or 'bank_transfer'" });
    return;
  }
  if (!destinationAccount?.accountNumber) {
    res.status(400).json({ success: false, message: 'destinationAccount.accountNumber is required' });
    return;
  }

  try {
    const payout = await vendorPayoutService.requestPayout({
      vendorId: sellerId,
      amount: parsedAmount,
      method,
      destinationAccount: {
        accountNumber: destinationAccount.accountNumber,
        accountName: destinationAccount.accountName ?? sellerId,
        bankCode: destinationAccount.bankCode,
      },
      requestedBy: 'seller',
    });
    res.status(201).json({ success: true, data: payout });
  } catch (error) {
    fail(res, error);
  }
}

/** GET /api/v1/seller/finance/withdrawals — the seller's own withdrawal history. */
export async function listSellerWithdrawals(req: Request, res: Response): Promise<void> {
  const sellerId = sellerIdOf(req, res);
  if (!sellerId) return;

  const { page, perPage } = pagination(req);

  try {
    const { data, total } = await vendorPayoutService.listPayouts({
      vendorId: sellerId,
      status: parseStatus(req.query.status),
      page,
      perPage,
    });
    res.json({ data, meta: { total, page, perPage } });
  } catch (error) {
    fail(res, error);
  }
}

// ─── Admin ────────────────────────────────────────────────────────────────────

/** GET /api/v1/admin/finance/withdrawals — the platform-wide withdrawal queue. */
export async function adminListWithdrawals(req: Request, res: Response): Promise<void> {
  const { page, perPage } = pagination(req);

  try {
    const { data, total } = await vendorPayoutService.listPayouts({
      status: parseStatus(req.query.status),
      vendorId: (req.query.seller_id as string) || undefined,
      page,
      perPage,
    });
    res.json({ data, meta: { total, page, perPage } });
  } catch (error) {
    fail(res, error);
  }
}

/** POST /api/v1/admin/finance/withdrawals/:id/approve */
export async function adminApproveWithdrawal(req: Request, res: Response): Promise<void> {
  const adminId = adminIdOf(req, res);
  if (!adminId) return;

  try {
    const payout = await vendorPayoutService.approvePayout(req.params.id, adminId);
    res.json({ success: true, data: payout });
  } catch (error) {
    fail(res, error);
  }
}

/** POST /api/v1/admin/finance/withdrawals/:id/reject — body: { reason } */
/**
 * POST /api/v1/admin/finance/withdrawals/:id/settle
 *
 * Confirm that a bank transfer MUNI cannot make itself has actually been made.
 *
 * Approving a bank_transfer payout used to mark it `completed` — saying the
 * seller had been paid when all that had happened was an admin clicking
 * approve. Approval now leaves it authorised-but-unsettled, and only this,
 * quoting the bank's own reference, closes it.
 */
export async function adminSettleWithdrawal(req: Request, res: Response): Promise<void> {
  const adminId = adminIdOf(req, res);
  if (!adminId) return;

  const reference = (req.body?.reference as string | undefined)?.trim();
  if (!reference) {
    res.status(400).json({
      success: false,
      message: 'The bank or provider reference for the completed transfer is required',
    });
    return;
  }

  try {
    const payout = await vendorPayoutService.settleManually(req.params.id, adminId, reference);
    res.json({ success: true, data: payout });
  } catch (error) {
    fail(res, error);
  }
}

export async function adminRejectWithdrawal(req: Request, res: Response): Promise<void> {
  const adminId = adminIdOf(req, res);
  if (!adminId) return;

  const reason = (req.body?.reason as string | undefined)?.trim();
  if (!reason) {
    res.status(400).json({ success: false, message: 'A rejection reason is required' });
    return;
  }

  try {
    const payout = await vendorPayoutService.rejectPayout(req.params.id, adminId, reason);
    res.json({ success: true, data: payout });
  } catch (error) {
    fail(res, error);
  }
}

/**
 * GET /api/v1/admin/finance/summary — settlement KPIs for the financials page.
 *
 * Every figure here is payment-service's own: commission it recorded, payouts
 * it disbursed, escrow it holds. Platform GMV lives in order-service and is
 * served by the dashboard aggregator instead — reporting it from two places
 * invites two different numbers.
 */
export async function adminFinanceSummary(_req: Request, res: Response): Promise<void> {
  try {
    const [commissions, payoutTotals, escrow] = await Promise.all([
      // perPage: 1 because only the database-wide totalCommission is wanted
      // here; the row itself is discarded.
      paymentSplitService.getPlatformCommissions({ perPage: 1 }),
      vendorPayoutService.getPayoutTotals(),
      escrowService.reconcileEscrowLedger(),
    ]);

    res.json({
      success: true,
      data: {
        currency:                 'UGX',
        platformCommissionEarned: commissions.totalCommission,
        totalPayoutsDisbursed:    payoutTotals.disbursed,
        pendingWithdrawalValue:   payoutTotals.reserved,
        escrow,
      },
    });
  } catch (error) {
    fail(res, error);
  }
}
