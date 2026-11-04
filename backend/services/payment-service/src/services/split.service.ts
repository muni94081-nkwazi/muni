import { Prisma } from '../generated/prisma/index.js';
import { prisma } from '../db/prisma.js';
import type {
  VendorBalance,
  VendorLedgerEntry,
  PlatformCommissionEntry,
} from '../models/payment.model.js';

// ─── Vendor money position ────────────────────────────────────────────────────
//
// Previously three module-level Maps. A seller's balance living in a process
// heap meant it reset on every deploy and diverged between replicas — two
// instances would each approve a withdrawal against the same shillings.
//
// The Prisma models these now write to already existed (VendorBalance,
// VendorLedgerEntry, PlatformCommissionEntry); only the code was still on Maps.
//
// Every write that touches money spans more than one row — a ledger entry plus
// a balance increment — so each goes through `prisma.$transaction`. A crash
// between the two halves is the difference between a seller being paid twice
// and not at all.

/** Money is rounded to 2dp at every boundary so cents cannot drift. */
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const DEFAULT_COMMISSION_RATE = 0.125; // 12.5% platform fee, 87.5% vendor share

type BalanceRow = Prisma.VendorBalanceGetPayload<Record<string, never>>;
type LedgerRow = Prisma.VendorLedgerEntryGetPayload<Record<string, never>>;
type CommissionRow = Prisma.PlatformCommissionEntryGetPayload<Record<string, never>>;

function toBalance(row: BalanceRow): VendorBalance {
  return {
    vendorId: row.vendorId,
    availableBalance: row.availableBalance.toNumber(),
    pendingBalance: row.pendingBalance.toNumber(),
    currency: row.currency,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toLedgerEntry(row: LedgerRow): VendorLedgerEntry {
  return {
    id: row.id,
    transactionId: row.transactionId,
    orderId: row.orderId,
    subOrderId: row.subOrderId,
    vendorId: row.vendorId,
    grossAmount: row.grossAmount.toNumber(),
    platformFee: row.platformFee.toNumber(),
    netVendorAmount: row.netVendorAmount.toNumber(),
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toCommissionEntry(row: CommissionRow): PlatformCommissionEntry {
  return {
    id: row.id,
    orderId: row.orderId,
    subOrderId: row.subOrderId,
    vendorId: row.vendorId,
    grossAmount: row.grossAmount.toNumber(),
    commissionRate: row.commissionRate.toNumber(),
    commissionAmount: row.commissionAmount.toNumber(),
    createdAt: row.createdAt.toISOString(),
  };
}

export interface SplitPaymentParams {
  transactionId: string;
  orderId: string;
  subOrders: Array<{
    subOrderId: string;
    sellerId: string;
    subtotal: number;
    vendorShare?: number;
    platformFee?: number;
  }>;
  commissionRate?: number; // Default 0.125 (12.5%)
}

export interface LedgerPage {
  data: VendorLedgerEntry[];
  total: number;
}

export class PaymentSplitService {
  private defaultCommissionRate = DEFAULT_COMMISSION_RATE;

  /**
   * Reading a balance creates the row if it does not exist yet, so a seller who
   * has never been paid reads as a real zero rather than a 404 the caller has
   * to special-case.
   */
  async getVendorBalance(vendorId: string): Promise<VendorBalance> {
    const row = await prisma.vendorBalance.upsert({
      where: { vendorId },
      create: { vendorId, availableBalance: 0, pendingBalance: 0, currency: 'UGX' },
      update: {},
    });
    return toBalance(row);
  }

  async getVendorLedger(
    vendorId: string,
    opts: { page?: number; perPage?: number; status?: VendorLedgerEntry['status'] } = {},
  ): Promise<LedgerPage> {
    const page = Math.max(1, opts.page ?? 1);
    const perPage = Math.min(100, Math.max(1, opts.perPage ?? 20));
    const where = { vendorId, ...(opts.status ? { status: opts.status } : {}) };

    const [rows, total] = await Promise.all([
      prisma.vendorLedgerEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      prisma.vendorLedgerEntry.count({ where }),
    ]);

    return { data: rows.map(toLedgerEntry), total };
  }

  /** Lifetime totals for a vendor, computed in the database rather than by paging the ledger. */
  async getVendorLifetimeTotals(vendorId: string): Promise<{
    lifetimeSales: number;
    lifetimeCommission: number;
    lifetimeNetEarnings: number;
    orderCount: number;
  }> {
    const agg = await prisma.vendorLedgerEntry.aggregate({
      where: { vendorId },
      _sum: { grossAmount: true, platformFee: true, netVendorAmount: true },
      _count: { _all: true },
    });

    return {
      lifetimeSales: agg._sum.grossAmount?.toNumber() ?? 0,
      lifetimeCommission: agg._sum.platformFee?.toNumber() ?? 0,
      lifetimeNetEarnings: agg._sum.netVendorAmount?.toNumber() ?? 0,
      orderCount: agg._count._all,
    };
  }

  async getPlatformCommissions(
    opts: { page?: number; perPage?: number } = {},
  ): Promise<{ data: PlatformCommissionEntry[]; total: number; totalCommission: number }> {
    const page = Math.max(1, opts.page ?? 1);
    const perPage = Math.min(100, Math.max(1, opts.perPage ?? 20));

    const [rows, total, agg] = await Promise.all([
      prisma.platformCommissionEntry.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      prisma.platformCommissionEntry.count(),
      prisma.platformCommissionEntry.aggregate({ _sum: { commissionAmount: true } }),
    ]);

    return {
      data: rows.map(toCommissionEntry),
      total,
      totalCommission: agg._sum.commissionAmount?.toNumber() ?? 0,
    };
  }

  /**
   * Split a confirmed payment across its sellers.
   *
   * Credits each vendor's `pendingBalance` — not `availableBalance`. The money
   * is real but not yet the seller's to withdraw; it clears only when the
   * sub-order is delivered (see releaseSubOrderVendorFunds below).
   *
   * A sub-order that has already been credited is skipped rather than credited
   * again. The `[subOrderId, vendorId]` unique constraint is what makes a
   * replayed provider webhook safe.
   */
  async processPaymentSplit(
    params: SplitPaymentParams,
  ): Promise<{ ledgerEntries: VendorLedgerEntry[]; commissions: PlatformCommissionEntry[] }> {
    const rate = params.commissionRate ?? this.defaultCommissionRate;

    const ledgerEntries: VendorLedgerEntry[] = [];
    const commissions: PlatformCommissionEntry[] = [];

    for (const subOrder of params.subOrders) {
      const grossAmount = subOrder.subtotal;
      const platformFee = subOrder.platformFee ?? Math.round(grossAmount * rate);
      const netVendorAmount = subOrder.vendorShare ?? grossAmount - platformFee;

      try {
        const [ledgerRow, commissionRow] = await prisma.$transaction([
          prisma.vendorLedgerEntry.create({
            data: {
              transactionId: params.transactionId,
              orderId: params.orderId,
              subOrderId: subOrder.subOrderId,
              vendorId: subOrder.sellerId,
              grossAmount,
              platformFee,
              netVendorAmount,
              status: 'pending',
            },
          }),
          prisma.platformCommissionEntry.create({
            data: {
              orderId: params.orderId,
              subOrderId: subOrder.subOrderId,
              vendorId: subOrder.sellerId,
              grossAmount,
              commissionRate: rate,
              commissionAmount: platformFee,
            },
          }),
          prisma.vendorBalance.upsert({
            where: { vendorId: subOrder.sellerId },
            create: {
              vendorId: subOrder.sellerId,
              availableBalance: 0,
              pendingBalance: netVendorAmount,
              currency: 'UGX',
            },
            update: { pendingBalance: { increment: netVendorAmount } },
          }),
        ]);

        ledgerEntries.push(toLedgerEntry(ledgerRow));
        commissions.push(toCommissionEntry(commissionRow));
      } catch (err) {
        // P2002 = unique violation on [subOrderId, vendorId]: this sub-order was
        // already credited. That is the guard working, not a failure — return
        // the existing entry so the caller sees the same result as first time.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          const existing = await prisma.vendorLedgerEntry.findUnique({
            where: { subOrderId_vendorId: { subOrderId: subOrder.subOrderId, vendorId: subOrder.sellerId } },
          });
          if (existing) ledgerEntries.push(toLedgerEntry(existing));
          continue;
        }
        throw err;
      }
    }

    return { ledgerEntries, commissions };
  }

  /**
   * Move a delivered sub-order's funds from pending to available.
   *
   * Returns null when there is no pending entry to release — either the
   * sub-order was never credited, or a duplicate delivery event already
   * released it. Both are no-ops rather than errors, which is what makes this
   * safe to call from an at-least-once Kafka consumer.
   */
  async releaseSubOrderVendorFunds(subOrderId: string, sellerId: string): Promise<VendorBalance | null> {
    const entry = await prisma.vendorLedgerEntry.findFirst({
      where: { subOrderId, vendorId: sellerId, status: 'pending' },
    });
    if (!entry) return null;

    const netVendorAmount = entry.netVendorAmount.toNumber();

    // Interactive rather than the array form, because the balance move has to
    // be conditional on winning the claim. With a fixed array both concurrent
    // callers would run their increment even though only one of them actually
    // flipped the ledger row — crediting the seller twice for one delivery.
    return prisma.$transaction(async (tx) => {
      const claimed = await tx.vendorLedgerEntry.updateMany({
        where: { id: entry.id, status: 'pending' },
        data: { status: 'available' },
      });
      // Lost the race: another delivery event for this sub-order already
      // released it, and it has been credited exactly once.
      if (claimed.count === 0) return null;

      await tx.vendorBalance.upsert({
        where: { vendorId: sellerId },
        create: {
          vendorId: sellerId,
          availableBalance: netVendorAmount,
          pendingBalance: 0,
          currency: 'UGX',
        },
        update: {
          pendingBalance: { decrement: netVendorAmount },
          availableBalance: { increment: netVendorAmount },
        },
      });

      return toBalance(await tx.vendorBalance.findUniqueOrThrow({ where: { vendorId: sellerId } }));
    });
  }

  /**
   * Attach the real sub-order ids to a payment's settlement records.
   *
   * Escrow and the ledger are written when the payment clears, which on the
   * checkout path happens *before* order-service has created anything — so the
   * ledger row was keyed on a synthetic `sub_<paymentOrderId>_<vendorId>`,
   * where `paymentOrderId` is the checkout session id. Delivery then arrives
   * carrying order-service's real sub-order id, which matched nothing, so
   * `releaseSubOrderVendorFunds` found no row and every seller's money stayed
   * in `pendingBalance` for good.
   *
   * This is also where the authoritative money lands: order-service computed
   * `vendorShare` and `platformCommission` against the basket it priced, and
   * those replace the figures the ledger derived for itself from the escrow
   * hold and its own copy of the commission rate. Two services independently
   * computing one seller's payout is a divergence waiting to happen; after
   * this call there is one answer, and it is order-service's.
   *
   * Idempotent: re-linking the same payment rewrites the same values, so a
   * retried saga step is free.
   */
  async linkSubOrders(params: {
    /** The id the payment was taken under — the checkout session id. */
    paymentOrderId: string;
    /** order-service's master order id, which the records adopt. */
    orderId: string;
    subOrders: Array<{
      sellerId: string;
      subOrderId: string;
      vendorShare?: number;
      platformCommission?: number;
    }>;
  }): Promise<{ linked: number }> {
    let linked = 0;

    for (const sub of params.subOrders) {
      const synthetic = `sub_${params.paymentOrderId}_${sub.sellerId}`;

      // The synthetic key first, then the real one so a re-link is a no-op
      // rather than a miss.
      const entry =
        (await prisma.vendorLedgerEntry.findFirst({
          where: { vendorId: sub.sellerId, subOrderId: synthetic },
        })) ??
        (await prisma.vendorLedgerEntry.findFirst({
          where: { vendorId: sub.sellerId, subOrderId: sub.subOrderId },
        }));

      // Nothing to link: this payment never produced a ledger row for that
      // seller. Skipped rather than invented — a payout must trace back to a
      // payment that actually cleared.
      if (!entry) continue;

      // Only a row still awaiting delivery may be re-keyed or re-priced.
      // Once it is `available` the seller has been paid against it and the
      // figures are history.
      if (entry.status !== 'pending') {
        linked += 1;
        continue;
      }

      const previousNet = entry.netVendorAmount.toNumber();
      const net = sub.vendorShare ?? previousNet;
      const fee = sub.platformCommission ?? entry.platformFee.toNumber();
      const delta = round2(net - previousNet);

      await prisma.$transaction(async (tx) => {
        await tx.vendorLedgerEntry.update({
          where: { id: entry.id },
          data: {
            subOrderId: sub.subOrderId,
            orderId: params.orderId,
            platformFee: fee,
            netVendorAmount: net,
          },
        });

        await tx.platformCommissionEntry.updateMany({
          where: { vendorId: sub.sellerId, subOrderId: synthetic },
          data: { subOrderId: sub.subOrderId, orderId: params.orderId, commissionAmount: fee },
        });

        // The pending balance was credited with the old figure; move it by the
        // difference rather than re-adding, so linking twice cannot inflate it.
        if (delta !== 0) {
          await tx.vendorBalance.update({
            where: { vendorId: sub.sellerId },
            data: { pendingBalance: { increment: delta } },
          });
        }

        await tx.escrowHold.updateMany({
          where: { orderId: params.paymentOrderId, vendorId: sub.sellerId },
          data: { subOrderId: sub.subOrderId },
        });
      });

      linked += 1;
    }

    return { linked };
  }

  /**
   * Take back what a refunded order credited.
   *
   * A refund used to return the buyer's money and leave the seller's ledger
   * entry standing, so a fully refunded order still paid the vendor. Both
   * states have to be undone: `pending` money is simply removed, and money
   * already released to `available` on delivery is clawed back too — a refund
   * after delivery is exactly the case where the seller must not keep it.
   *
   * Never throws. It runs after the refund itself has succeeded, and failing
   * here must not make a completed refund look like a failure; a loud log is
   * what reconciliation needs instead.
   */
  async reverseSettlement(orderId: string): Promise<{ reversed: number; amount: number }> {
    const entries = await prisma.vendorLedgerEntry.findMany({
      where: { orderId, status: { in: ['pending', 'available'] } },
    });

    let reversed = 0;
    let amount = 0;

    for (const entry of entries) {
      const net = entry.netVendorAmount.toNumber();

      const claimed = await prisma.vendorLedgerEntry.updateMany({
        where: { id: entry.id, status: entry.status },
        data: { status: 'reversed' },
      });
      // Lost a race with a concurrent release or reversal — whoever won owns
      // the balance move, so this one must not also apply it.
      if (claimed.count === 0) continue;

      await prisma.vendorBalance.update({
        where: { vendorId: entry.vendorId },
        data: entry.status === 'pending'
          ? { pendingBalance: { decrement: net } }
          : { availableBalance: { decrement: net } },
      });

      reversed += 1;
      amount = round2(amount + net);
    }

    return { reversed, amount };
  }
}

export const paymentSplitService = new PaymentSplitService();
