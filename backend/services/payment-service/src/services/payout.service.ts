import { randomUUID } from 'node:crypto';
import { Prisma } from '../generated/prisma/index.js';
import { prisma } from '../db/prisma.js';
import { logger } from '../utils/logger.js';
import { mtnMomoDriver } from '../drivers/mtn-momo.driver.js';
import { airtelMoneyDriver } from '../drivers/airtel-money.driver.js';
import { ProviderApiError } from '../drivers/types.js';
import type { MobileMoneyDriver, DisbursementStatusResult } from '../drivers/types.js';
import { normalizeUgandaMsisdn, InvalidPhoneNumberError } from '../utils/phone.js';
import type {
  VendorPayout,
  PayoutMethod,
  PayoutStatus,
  PayoutDestinationAccount,
} from '../models/payment.model.js';

// ─── Vendor withdrawals ───────────────────────────────────────────────────────
//
// Two changes from the previous implementation, both deliberate:
//
//   1. Payouts persist in Postgres (model VendorPayout, which already existed)
//      rather than a module-level Map. A withdrawal queue that empties on
//      deploy is not a queue.
//
//   2. A seller's request no longer disburses inline. It lands in `pending` and
//      waits for an admin to approve or reject it. Funds are reserved off the
//      available balance at request time regardless, so a seller cannot queue
//      three withdrawals against one balance and have all three approved.

const MINIMUM_PAYOUT_AMOUNT = 50_000; // 50,000 UGX minimum payout

// Bounded inline polling for disbursement confirmation: real B2C transfers
// usually confirm within a couple of seconds, so we wait briefly rather than
// leaving every payout stuck in "processing" for the caller. If it's still
// unresolved after this, we return status 'processing' honestly — the
// pending-payment worker only tracks *collections* (customer-facing PIN
// prompts); disbursement reconciliation is a separate job outside this scope.
const DISBURSEMENT_POLL_ATTEMPTS = 3;
const DISBURSEMENT_POLL_DELAY_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class PayoutValidationError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'PayoutValidationError';
  }
}

export class PayoutNotFoundError extends Error {
  readonly status = 404;
  constructor(payoutId: string) {
    super(`Withdrawal request ${payoutId} was not found`);
    this.name = 'PayoutNotFoundError';
  }
}

/** Raised when a withdrawal is acted on from a state that does not allow it. */
export class PayoutStateError extends Error {
  readonly status = 409;
  constructor(message: string) {
    super(message);
    this.name = 'PayoutStateError';
  }
}

function resolveDriver(bankCode: string | undefined): { driver: MobileMoneyDriver; name: string } {
  const code = (bankCode ?? '').toUpperCase();
  if (code === 'MTN') return { driver: mtnMomoDriver, name: 'MTN' };
  if (code === 'AIRTEL') return { driver: airtelMoneyDriver, name: 'AIRTEL' };
  throw new PayoutValidationError(
    `Unsupported or missing mobile money network in destinationAccount.bankCode: "${bankCode ?? ''}" (expected "MTN" or "AIRTEL")`,
  );
}

type PayoutRow = Prisma.VendorPayoutGetPayload<Record<string, never>>;

function toDomain(row: PayoutRow): VendorPayout {
  return {
    id: row.id,
    vendorId: row.vendorId,
    amount: row.amount.toNumber(),
    currency: row.currency,
    method: row.method,
    destinationAccount: row.destinationAccount as unknown as PayoutDestinationAccount,
    status: row.status,
    reference: row.reference,
    requestedBy: row.requestedBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    processedAt: row.processedAt?.toISOString() ?? null,
    failureReason: row.failureReason,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    rejectionReason: row.rejectionReason,
  };
}

export interface RequestPayoutParams {
  vendorId: string;
  amount: number;
  method: PayoutMethod;
  destinationAccount: PayoutDestinationAccount;
  requestedBy?: 'seller' | 'system_scheduled';
}

export interface ListPayoutsParams {
  vendorId?: string;
  status?: PayoutStatus;
  page?: number;
  perPage?: number;
}

export class VendorPayoutService {
  // ─── Seller: request a withdrawal ───────────────────────────────────────────

  /**
   * Reserve the requested amount and queue it for admin review.
   *
   * The balance check and the deduction are one conditional UPDATE, not a read
   * followed by a write: `availableBalance: { gte: amount }` in the WHERE clause
   * means two concurrent requests cannot both pass the check against the same
   * funds — the second matches zero rows and is rejected.
   */
  async requestPayout(params: RequestPayoutParams): Promise<VendorPayout> {
    if (params.amount < MINIMUM_PAYOUT_AMOUNT) {
      throw new PayoutValidationError(
        `Minimum payout amount is UGX ${MINIMUM_PAYOUT_AMOUNT.toLocaleString()}`,
      );
    }
    if (!params.destinationAccount?.accountNumber) {
      throw new PayoutValidationError('destinationAccount.accountNumber is required');
    }

    // Fail early with a useful message when the network code is unusable, rather
    // than reserving the funds and only discovering it at approval time.
    if (params.method === 'mobile_money') {
      resolveDriver(params.destinationAccount.bankCode);
      try {
        normalizeUgandaMsisdn(params.destinationAccount.accountNumber);
      } catch (err) {
        throw new PayoutValidationError(
          err instanceof InvalidPhoneNumberError ? err.message : 'Invalid destination account',
        );
      }
    }

    const balance = await prisma.vendorBalance.upsert({
      where: { vendorId: params.vendorId },
      create: { vendorId: params.vendorId, availableBalance: 0, pendingBalance: 0, currency: 'UGX' },
      update: {},
    });

    const reserved = await prisma.vendorBalance.updateMany({
      where: { vendorId: params.vendorId, availableBalance: { gte: params.amount } },
      data: { availableBalance: { decrement: params.amount } },
    });

    if (reserved.count === 0) {
      throw new PayoutValidationError(
        `Insufficient available balance. Requested: ${params.amount}, Available: ${balance.availableBalance.toNumber()}`,
      );
    }

    try {
      const row = await prisma.vendorPayout.create({
        data: {
          id: `po_${randomUUID()}`,
          vendorId: params.vendorId,
          amount: params.amount,
          currency: balance.currency || 'UGX',
          method: params.method,
          destinationAccount: params.destinationAccount as unknown as Prisma.InputJsonValue,
          status: 'pending',
          reference: `PO-${randomUUID().slice(0, 8).toUpperCase()}`,
          requestedBy: params.requestedBy ?? 'seller',
        },
      });
      return toDomain(row);
    } catch (err) {
      // The funds are already reserved at this point; if the request row itself
      // could not be written there is nothing to release them later, so undo it.
      await this.restoreBalance(params.vendorId, params.amount);
      throw err;
    }
  }

  // ─── Admin: approve / reject ────────────────────────────────────────────────

  /**
   * Approve a pending withdrawal and disburse it.
   *
   * The status moves to `processing` before the provider is called, guarded on
   * the row still being `pending` — so two admins clicking approve at the same
   * moment produce one disbursement, not two.
   */
  async approvePayout(payoutId: string, adminId: string): Promise<VendorPayout> {
    const existing = await prisma.vendorPayout.findUnique({ where: { id: payoutId } });
    if (!existing) throw new PayoutNotFoundError(payoutId);
    if (existing.status !== 'pending') {
      throw new PayoutStateError(
        `Only a pending withdrawal can be approved; this one is '${existing.status}'`,
      );
    }

    const claimed = await prisma.vendorPayout.updateMany({
      where: { id: payoutId, status: 'pending' },
      data: { status: 'processing', reviewedBy: adminId, reviewedAt: new Date() },
    });
    if (claimed.count === 0) {
      throw new PayoutStateError('This withdrawal was already actioned by another admin');
    }

    const payout = toDomain(
      await prisma.vendorPayout.findUniqueOrThrow({ where: { id: payoutId } }),
    );

    if (payout.method === 'mobile_money') {
      return this.executeMobileMoneyDisbursement(payout);
    }

    // MUNI has no bank-transfer driver: nothing in this service moves money to
    // a bank account. Approval used to mark such a payout `completed`, which
    // said the seller had been paid when all that had happened was an admin
    // clicking approve — the transfer itself is made by a human, out of band,
    // possibly days later or not at all.
    //
    // It now stays in `processing`: authorised, not settled. A human confirms
    // the real transfer through `settleManually` below, quoting the bank's own
    // reference, and only that marks it completed. The seller's reserved funds
    // stay reserved either way, so nothing about the money changes — only
    // whether the record claims something that has not happened.
    logger.info('[payout] bank transfer authorised — awaiting manual settlement', {
      payoutId, vendorId: payout.vendorId, amount: payout.amount,
    });
    return payout;
  }

  /** Decline a pending withdrawal and release the reserved funds back to the seller. */
  async rejectPayout(payoutId: string, adminId: string, reason: string): Promise<VendorPayout> {
    const trimmed = reason?.trim();
    if (!trimmed) {
      throw new PayoutValidationError('A rejection reason is required');
    }

    const existing = await prisma.vendorPayout.findUnique({ where: { id: payoutId } });
    if (!existing) throw new PayoutNotFoundError(payoutId);
    if (existing.status !== 'pending') {
      throw new PayoutStateError(
        `Only a pending withdrawal can be rejected; this one is '${existing.status}'`,
      );
    }

    const rejected = await prisma.vendorPayout.updateMany({
      where: { id: payoutId, status: 'pending' },
      data: {
        status: 'rejected',
        rejectionReason: trimmed,
        reviewedBy: adminId,
        reviewedAt: new Date(),
        processedAt: new Date(),
      },
    });
    if (rejected.count === 0) {
      throw new PayoutStateError('This withdrawal was already actioned by another admin');
    }

    // Only release funds once the reject actually won the race above, so a
    // losing concurrent call cannot credit the seller a second time.
    await this.restoreBalance(existing.vendorId, existing.amount.toNumber());

    return toDomain(await prisma.vendorPayout.findUniqueOrThrow({ where: { id: payoutId } }));
  }

  // ─── Disbursement ───────────────────────────────────────────────────────────

  private async executeMobileMoneyDisbursement(payout: VendorPayout): Promise<VendorPayout> {
    let phoneNumber: string;
    try {
      phoneNumber = normalizeUgandaMsisdn(payout.destinationAccount.accountNumber);
    } catch (err) {
      const reason = err instanceof InvalidPhoneNumberError ? err.message : 'Invalid destination account';
      return this.markFailed(payout, reason);
    }

    const { driver, name } = resolveDriver(payout.destinationAccount.bankCode);

    try {
      const { providerReferenceId } = await driver.initiateDisbursement({
        amount: payout.amount,
        phoneNumber,
        externalId: payout.reference,
        payerMessage: `Muni.ug vendor payout ${payout.reference}`,
        payeeNote: payout.vendorId,
      });

      const finalStatus = await this.pollDisbursementOutcome(driver, providerReferenceId);

      if (finalStatus.status === 'SUCCESSFUL') {
        logger.info('[payout] Disbursement confirmed', { network: name, reference: payout.reference });
        return this.markCompleted(payout.id);
      }

      if (finalStatus.status === 'FAILED') {
        logger.warn('[payout] Disbursement failed', {
          network: name,
          reference: payout.reference,
          reason: finalStatus.reason,
        });
        return this.markFailed(payout, finalStatus.reason ?? `${name} disbursement failed`);
      }

      // Still PENDING after bounded polling — left as 'processing'. The funds
      // stay reserved: releasing them here would risk paying the seller twice
      // if the transfer later lands.
      logger.warn('[payout] Disbursement still pending after poll window', {
        network: name,
        reference: payout.reference,
      });
      return toDomain(await prisma.vendorPayout.findUniqueOrThrow({ where: { id: payout.id } }));
    } catch (err) {
      const reason = err instanceof ProviderApiError ? err.message : (err as Error).message;
      logger.error('[payout] Disbursement request threw', {
        network: name,
        reference: payout.reference,
        error: reason,
      });
      return this.markFailed(payout, reason);
    }
  }

  private async pollDisbursementOutcome(
    driver: MobileMoneyDriver,
    providerReferenceId: string,
  ): Promise<DisbursementStatusResult> {
    let last: DisbursementStatusResult = { status: 'PENDING' };
    for (let attempt = 1; attempt <= DISBURSEMENT_POLL_ATTEMPTS; attempt++) {
      const result = await driver.getDisbursementStatus(providerReferenceId);
      if (result.status !== 'PENDING') return result;
      last = result;
      if (attempt < DISBURSEMENT_POLL_ATTEMPTS) await sleep(DISBURSEMENT_POLL_DELAY_MS);
    }
    return last;
  }

  /**
   * Record that a bank transfer this service cannot make has actually been made.
   *
   * The only way a `bank_transfer` payout reaches `completed`. It demands the
   * bank's own reference so the claim is traceable to something outside MUNI —
   * an admin cannot close one by asserting it happened.
   *
   * Mobile money never comes through here: those are settled by a real provider
   * response in `executeMobileMoneyDisbursement`.
   */
  async settleManually(payoutId: string, adminId: string, reference: string): Promise<VendorPayout> {
    const trimmed = reference?.trim();
    if (!trimmed) {
      throw new PayoutValidationError('The bank or provider reference for the completed transfer is required');
    }

    const existing = await prisma.vendorPayout.findUnique({ where: { id: payoutId } });
    if (!existing) throw new PayoutNotFoundError(payoutId);

    if (existing.method !== 'bank_transfer') {
      throw new PayoutStateError(
        'Only a bank transfer is settled by hand; mobile money is settled by the provider.',
      );
    }
    if (existing.status !== 'processing') {
      throw new PayoutStateError(
        `Only an authorised withdrawal can be settled; this one is '${existing.status}'`,
      );
    }

    const claimed = await prisma.vendorPayout.updateMany({
      where: { id: payoutId, status: 'processing' },
      data: {
        status: 'completed',
        processedAt: new Date(),
        settlementReference: trimmed,
        reviewedBy: adminId,
      },
    });
    if (claimed.count === 0) {
      throw new PayoutStateError('This withdrawal was already settled by another admin');
    }

    logger.info('[payout] bank transfer settled by hand', { payoutId, adminId, reference: trimmed });
    return toDomain(await prisma.vendorPayout.findUniqueOrThrow({ where: { id: payoutId } }));
  }

  private async markCompleted(payoutId: string): Promise<VendorPayout> {
    const row = await prisma.vendorPayout.update({
      where: { id: payoutId },
      data: { status: 'completed', processedAt: new Date() },
    });
    return toDomain(row);
  }

  private async markFailed(payout: VendorPayout, reason: string): Promise<VendorPayout> {
    const row = await prisma.vendorPayout.update({
      where: { id: payout.id },
      data: { status: 'failed', failureReason: reason, processedAt: new Date() },
    });
    // The transfer did not happen, so the reservation must not stand.
    await this.restoreBalance(payout.vendorId, payout.amount);
    return toDomain(row);
  }

  private async restoreBalance(vendorId: string, amount: number): Promise<void> {
    await prisma.vendorBalance.update({
      where: { vendorId },
      data: { availableBalance: { increment: amount } },
    });
  }

  // ─── Reads ──────────────────────────────────────────────────────────────────

  async getPayoutById(payoutId: string): Promise<VendorPayout | null> {
    const row = await prisma.vendorPayout.findUnique({ where: { id: payoutId } });
    return row ? toDomain(row) : null;
  }

  async listPayouts(params: ListPayoutsParams = {}): Promise<{ data: VendorPayout[]; total: number }> {
    const page = Math.max(1, params.page ?? 1);
    const perPage = Math.min(100, Math.max(1, params.perPage ?? 20));
    const where = {
      ...(params.vendorId ? { vendorId: params.vendorId } : {}),
      ...(params.status ? { status: params.status } : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.vendorPayout.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      prisma.vendorPayout.count({ where }),
    ]);

    return { data: rows.map(toDomain), total };
  }

  async getPayoutsByVendor(vendorId: string): Promise<VendorPayout[]> {
    const { data } = await this.listPayouts({ vendorId, perPage: 100 });
    return data;
  }

  /**
   * Total value of payouts that actually reached sellers, and the value still
   * committed to requests in flight.
   *
   * Summed in the database rather than over a page of rows: a page-local total
   * silently under-reports as soon as a seller has more withdrawals than fit in
   * one page, and reads correctly right up until it doesn't.
   *
   * Pass a vendorId for one seller, omit it for the platform-wide figure.
   */
  async getPayoutTotals(vendorId?: string): Promise<{ disbursed: number; reserved: number }> {
    const scope = vendorId ? { vendorId } : {};

    const [completed, inFlight] = await Promise.all([
      prisma.vendorPayout.aggregate({ where: { ...scope, status: 'completed' }, _sum: { amount: true } }),
      prisma.vendorPayout.aggregate({
        where: { ...scope, status: { in: ['pending', 'processing'] } },
        _sum: { amount: true },
      }),
    ]);

    return {
      disbursed: completed._sum.amount?.toNumber() ?? 0,
      reserved: inFlight._sum.amount?.toNumber() ?? 0,
    };
  }

  // ─── Scheduled weekly run ───────────────────────────────────────────────────

  /**
   * Sweep every vendor whose cleared balance clears the minimum.
   *
   * This used to iterate a hardcoded `['vendor-1', 'vendor-2', …]` list left
   * over from the mock and send every one of them to the same made-up phone
   * number, so it paid four fictional sellers and no real ones. It now queries
   * actual balances.
   *
   * The destination comes from the vendor's own last completed payout — the
   * only payout account this service has first-hand evidence of. A vendor who
   * has never been paid is skipped rather than guessed at: their bank details
   * live on SellerProfile in auth-service, and inventing a destination is how
   * money reaches the wrong person.
   *
   * System-scheduled payouts are approved as they are created — the admin
   * review step exists to vet seller-initiated requests, and there is no human
   * in this loop to do the vetting.
   */
  async processWeeklyPayouts(): Promise<{
    processedCount: number;
    totalDisbursed: number;
    skippedNoDestination: string[];
    payouts: VendorPayout[];
  }> {
    logger.info('[payout] Starting weekly vendor payout run…');

    const eligible = await prisma.vendorBalance.findMany({
      where: { availableBalance: { gte: MINIMUM_PAYOUT_AMOUNT } },
    });

    const payouts: VendorPayout[] = [];
    const skippedNoDestination: string[] = [];
    let totalDisbursed = 0;

    for (const balance of eligible) {
      const amountToPay = balance.availableBalance.toNumber();

      const lastSettled = await prisma.vendorPayout.findFirst({
        where: { vendorId: balance.vendorId, status: 'completed' },
        orderBy: { processedAt: 'desc' },
      });

      if (!lastSettled) {
        skippedNoDestination.push(balance.vendorId);
        logger.warn('[payout] Skipping weekly payout — no known destination account', {
          vendorId: balance.vendorId,
        });
        continue;
      }

      try {
        const requested = await this.requestPayout({
          vendorId: balance.vendorId,
          amount: amountToPay,
          method: lastSettled.method,
          destinationAccount: lastSettled.destinationAccount as unknown as PayoutDestinationAccount,
          requestedBy: 'system_scheduled',
        });
        const settled = await this.approvePayout(requested.id, 'system');
        payouts.push(settled);
        if (settled.status === 'completed') totalDisbursed += amountToPay;
      } catch (err) {
        logger.error('[payout] Weekly payout failed', {
          vendorId: balance.vendorId,
          error: (err as Error).message,
        });
      }
    }

    logger.info('[payout] Weekly payout run complete', {
      totalDisbursed,
      vendorCount: payouts.length,
      skipped: skippedNoDestination.length,
    });
    return { processedCount: payouts.length, totalDisbursed, skippedNoDestination, payouts };
  }
}

export const vendorPayoutService = new VendorPayoutService();
