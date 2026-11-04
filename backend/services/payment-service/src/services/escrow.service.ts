import { Prisma } from '../generated/prisma/index.js';
import { prisma } from '../db/prisma.js';
import type { EscrowHoldEntry } from '../models/payment.model.js';
import { publish } from '../../../../shared/kafka/producer.js';

// ─── Escrow ledger ────────────────────────────────────────────────────────────
//
// Previously a module-level `Map<string, EscrowHoldEntry>` seeded at import
// time with a fake hold for order MUNI-1001. Both are gone: buyer funds are not
// something to keep in a process that can be restarted by a rolling deploy, and
// a seed row that materialises in every environment — production included — is
// not test data, it is a phantom liability on the balance sheet.
//
// Seed data for local development belongs in prisma/seed.ts, run explicitly.

const AUTO_RELEASE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days post-delivery

type Row = Prisma.EscrowHoldGetPayload<Record<string, never>>;

function toDomain(row: Row): EscrowHoldEntry {
  return {
    id: row.id,
    orderId: row.orderId,
    subOrderId: row.subOrderId,
    vendorId: row.vendorId,
    buyerId: row.buyerId,
    amountUGX: row.amountUGX.toNumber(),
    status: row.status,
    autoReleaseDate: row.autoReleaseDate.toISOString(),
    holdReason: row.holdReason ?? undefined,
    releasedAt: row.releasedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** One vendor's slice of a buyer's payment. */
export interface VendorHoldInput {
  vendorId: string;
  /** Known only when the sub-order already exists; see the schema note. */
  subOrderId?: string;
  amountUGX: number;
}

export class InvalidEscrowBreakdownError extends Error {
  readonly status = 422;
  constructor(message: string) { super(message); this.name = 'InvalidEscrowBreakdownError'; }
}

/**
 * Collapse a line-item breakdown into one entry per vendor.
 *
 * The caller passes whatever granularity it has — usually cart lines — and
 * this sums them per seller. Doing it here rather than at each call site is
 * what stops a second caller from reintroducing "just use the first seller".
 */
export function groupHoldsByVendor(
  lines: Array<{ sellerId?: string | null; vendorId?: string | null; subOrderId?: string; amountUGX: number }>,
): VendorHoldInput[] {
  const byVendor = new Map<string, VendorHoldInput>();

  for (const line of lines) {
    const vendorId = (line.sellerId ?? line.vendorId ?? '').trim();
    if (!vendorId) {
      throw new InvalidEscrowBreakdownError('Every escrow line must name the vendor it belongs to.');
    }

    const amount = Number(line.amountUGX);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new InvalidEscrowBreakdownError(`Escrow amount for vendor ${vendorId} is not a usable number.`);
    }

    const existing = byVendor.get(vendorId);
    if (existing) {
      existing.amountUGX = round2(existing.amountUGX + amount);
      existing.subOrderId ??= line.subOrderId;
    } else {
      byVendor.set(vendorId, {
        vendorId,
        amountUGX: round2(amount),
        ...(line.subOrderId ? { subOrderId: line.subOrderId } : {}),
      });
    }
  }

  if (byVendor.size === 0) {
    throw new InvalidEscrowBreakdownError('An escrow breakdown needs at least one line.');
  }

  // Deterministic order so a multi-vendor upsert always takes row locks the
  // same way and two concurrent retries cannot deadlock against each other.
  return [...byVendor.values()].sort((a, b) => a.vendorId.localeCompare(b.vendorId));
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export class EscrowService {
  /**
   * Hold a buyer's funds, one row per vendor in the basket.
   *
   * A cart spanning three sellers produces three holds carrying their own
   * amounts, rather than one row naming whichever seller happened to come
   * first and carrying the whole basket's value.
   *
   * Idempotent per (orderId, vendorId): a retried payment upserts the same
   * rows instead of doubling anyone's holdings. `update: {}` is deliberate —
   * a replay must not overwrite an amount, least of all one already released.
   */
  async createEscrowHolds(input: {
    orderId: string;
    buyerId: string;
    holds: VendorHoldInput[];
  }): Promise<EscrowHoldEntry[]> {
    if (input.holds.length === 0) {
      throw new InvalidEscrowBreakdownError('An escrow breakdown needs at least one vendor.');
    }

    const autoReleaseDate = new Date(Date.now() + AUTO_RELEASE_WINDOW_MS);
    const entries: EscrowHoldEntry[] = [];

    for (const hold of input.holds) {
      const row = await prisma.escrowHold.upsert({
        where: { orderId_vendorId: { orderId: input.orderId, vendorId: hold.vendorId } },
        create: {
          orderId: input.orderId,
          subOrderId: hold.subOrderId ?? null,
          vendorId: hold.vendorId,
          buyerId: input.buyerId,
          amountUGX: hold.amountUGX,
          status: 'in_escrow',
          autoReleaseDate,
        },
        update: {},
      });

      entries.push(toDomain(row));
    }

    void publish('payment-events' as any, {
      type: 'escrow.created',
      data: {
        orderId: input.orderId,
        buyerId: input.buyerId,
        holds: entries,
        totalAmountUGX: round2(entries.reduce((sum, e) => sum + e.amountUGX, 0)),
      },
    });

    return entries;
  }

  /** Every hold for an order, in vendor order. */
  async getEscrowHolds(orderId: string): Promise<EscrowHoldEntry[]> {
    const rows = await prisma.escrowHold.findMany({
      where: { orderId },
      orderBy: { vendorId: 'asc' },
    });
    return rows.map(toDomain);
  }

  /**
   * The single hold for an (order, vendor) pair.
   *
   * Replaces the old `getEscrowStatus(orderId)`, which could only ever return
   * one row and so silently hid every other vendor on a multi-vendor order.
   */
  async getVendorEscrowHold(orderId: string, vendorId: string): Promise<EscrowHoldEntry | null> {
    const row = await prisma.escrowHold.findUnique({
      where: { orderId_vendorId: { orderId, vendorId } },
    });
    return row ? toDomain(row) : null;
  }

  /**
   * Release escrow on an order — for one vendor, or for all of them.
   *
   * `scope.vendorId` is the important half. Without it this releases every
   * vendor on the order, and the caller that matters — buyer-protection's
   * `confirmReceipt` — is triggered by a buyer confirming delivery from ONE
   * seller. On a three-seller basket that paid all three the moment the first
   * parcel arrived, including sellers who had not shipped anything. The money
   * is gone at that point: `released_to_vendor` is terminal, and the buyer's
   * remaining protection against the other two sellers went with it.
   *
   * Unscoped release is kept rather than removed, because it is correct for a
   * single-vendor order and is what the auto-release sweep wants. But it is
   * logged when it spans more than one vendor, since that is the shape of the
   * bug and a caller doing it by accident should be visible.
   *
   * A hold under dispute is skipped rather than failing the whole call: one
   * seller's dispute must not block payout to the others in the same basket.
   * The returned entries say what actually happened to each.
   */
  async releaseEscrow(
    orderId: string,
    releasedBy = 'buyer',
    scope: { vendorId?: string; subOrderId?: string } = {},
  ): Promise<EscrowHoldEntry[]> {
    // Narrowing clauses, applied to every query below so the scope cannot be
    // honoured in one place and forgotten in another.
    const scopeWhere = {
      ...(scope.vendorId   ? { vendorId:   scope.vendorId }   : {}),
      ...(scope.subOrderId ? { subOrderId: scope.subOrderId } : {}),
    };

    const existing = await prisma.escrowHold.findMany({
      where: { orderId, ...scopeWhere },
      orderBy: { vendorId: 'asc' },
    });
    if (existing.length === 0) return [];

    if (!scope.vendorId && existing.length > 1) {
      console.warn(
        '[escrow] unscoped release across a multi-vendor order — every vendor is being paid, ' +
        'including any that have not delivered',
        { orderId, vendorCount: existing.length, releasedBy },
      );
    }

    const releasable = existing.filter((row) => row.status === 'in_escrow');

    if (releasable.length === 0) {
      // Nothing to do — either already released, or every hold is frozen. A
      // caller releasing a wholly-disputed order should hear about it.
      if (existing.every((row) => row.status === 'dispute_hold')) {
        throw new Error('Cannot release escrow funds while order is under active dispute hold');
      }
      return existing.map(toDomain);
    }

    const releasedAt = new Date();

    for (const row of releasable) {
      // Conditional update rather than read-modify-write: two concurrent
      // release calls would otherwise both pass the check above and both emit
      // an escrow.released event, double-crediting the vendor downstream.
      //
      // Already per-vendor before this change — the over-release came from
      // WHICH rows `releasable` contained, not from how each was written.
      const updated = await prisma.escrowHold.updateMany({
        where: { orderId, vendorId: row.vendorId, status: 'in_escrow' },
        data: { status: 'released_to_vendor', releasedAt },
      });

      // Lost the race — someone else released or froze this vendor's hold.
      if (updated.count === 0) continue;

      void publish('payment-events' as any, {
        type: 'escrow.released',
        data: {
          orderId,
          vendorId: row.vendorId,
          subOrderId: row.subOrderId,
          amountUGX: row.amountUGX.toNumber(),
          releasedBy,
          releasedAt: releasedAt.toISOString(),
        },
      });
    }

    // The scoped set, not every hold on the order: a caller releasing one
    // vendor should get back what it released, and the controller counts these
    // rows to report how many vendors were paid.
    return (
      await prisma.escrowHold.findMany({
        where: { orderId, ...scopeWhere },
        orderBy: { vendorId: 'asc' },
      })
    ).map(toDomain);
  }

  /**
   * Return a buyer's funds — for one vendor, or for all of them.
   *
   * The third of the three transitions, and until now the only one that did not
   * exist. `refunded_to_buyer` was in the status enum and summed by
   * `reconcileEscrowLedger`, but nothing ever wrote it: buyer-protection
   * flipped its own hold to REFUNDED and published an `escrow.refund_requested`
   * event that no service subscribed to. So after a buyer-favour dispute the
   * two ledgers disagreed permanently — buyer-protection said refunded, this
   * one still said `dispute_hold`, and `refundedUGX` was always zero.
   *
   * Refundable from `dispute_hold` as well as `in_escrow`, which is the one way
   * this differs from `releaseEscrow`: a refund is precisely what resolves a
   * frozen hold, so refusing to act on a frozen one would make the endpoint
   * useless for the case it exists to serve.
   *
   * No `refundedAt` column exists on EscrowHold — only `releasedAt` — so the
   * time is carried by the row's own `updatedAt`, and `holdReason` names the
   * dispute the way `freezeEscrowForDispute` already does. Adding a dedicated
   * column is a migration, and is flagged rather than assumed.
   */
  async refundEscrow(
    orderId: string,
    refundedBy = 'dispute',
    scope: { vendorId?: string; subOrderId?: string; disputeId?: string } = {},
  ): Promise<EscrowHoldEntry[]> {
    const scopeWhere = {
      ...(scope.vendorId   ? { vendorId:   scope.vendorId }   : {}),
      ...(scope.subOrderId ? { subOrderId: scope.subOrderId } : {}),
    };

    const existing = await prisma.escrowHold.findMany({
      where: { orderId, ...scopeWhere },
      orderBy: { vendorId: 'asc' },
    });
    if (existing.length === 0) return [];

    if (!scope.vendorId && existing.length > 1) {
      console.warn(
        '[escrow] unscoped refund across a multi-vendor order — every vendor’s hold is being ' +
        'returned to the buyer, including vendors the dispute was not about',
        { orderId, vendorCount: existing.length, refundedBy },
      );
    }

    // Money already paid out cannot be clawed back from here; saying so is
    // better than reporting a refund that did not happen.
    const refundable = existing.filter(
      (row) => row.status === 'in_escrow' || row.status === 'dispute_hold',
    );

    if (refundable.length === 0) {
      if (existing.every((row) => row.status === 'released_to_vendor')) {
        throw new Error('Cannot refund escrow funds that have already been released to the vendor');
      }
      return existing.map(toDomain);
    }

    const refundedAt = new Date();

    for (const row of refundable) {
      // Conditional update for the same reason release uses one: two callers
      // resolving the same dispute must not both emit escrow.refunded and
      // credit the buyer twice downstream.
      const updated = await prisma.escrowHold.updateMany({
        where: { orderId, vendorId: row.vendorId, status: { in: ['in_escrow', 'dispute_hold'] } },
        data: {
          status: 'refunded_to_buyer',
          holdReason: scope.disputeId
            ? `Refunded to buyer for dispute #${scope.disputeId}`
            : `Refunded to buyer (${refundedBy})`,
        },
      });

      if (updated.count === 0) continue;

      void publish('payment-events' as any, {
        // `eventType`, not `type`. Every payment-events consumer on the platform
        // filters on eventType — buyer-protection's orphaned
        // `escrow.refund_requested` used `type`, so even a consumer written for
        // it would never have matched.
        eventType: 'escrow.refunded',
        data: {
          orderId,
          vendorId: row.vendorId,
          subOrderId: row.subOrderId,
          buyerId: row.buyerId,
          amountUGX: row.amountUGX.toNumber(),
          disputeId: scope.disputeId ?? null,
          refundedBy,
          refundedAt: refundedAt.toISOString(),
        },
      });
    }

    return (
      await prisma.escrowHold.findMany({
        where: { orderId, ...scopeWhere },
        orderBy: { vendorId: 'asc' },
      })
    ).map(toDomain);
  }

  /**
   * Freeze an order's holds pending a dispute.
   *
   * `vendorId` narrows it to one seller — a dispute is usually with one seller
   * in a multi-vendor basket, and freezing the others' money over it would be
   * wrong. Omit it to freeze the whole order.
   */
  async freezeEscrowForDispute(
    orderId: string,
    disputeId: string,
    vendorId?: string,
  ): Promise<EscrowHoldEntry[]> {
    // Only funds still in escrow can be frozen — once released to the vendor
    // the money has left, and pretending otherwise hides a real problem.
    const updated = await prisma.escrowHold.updateMany({
      where: { orderId, status: 'in_escrow', ...(vendorId ? { vendorId } : {}) },
      data: { status: 'dispute_hold', holdReason: `Frozen due to active dispute #${disputeId}` },
    });
    if (updated.count === 0) return [];

    const frozen = await prisma.escrowHold.findMany({
      where: { orderId, status: 'dispute_hold', ...(vendorId ? { vendorId } : {}) },
      orderBy: { vendorId: 'asc' },
    });

    for (const row of frozen) {
      void publish('payment-events' as any, {
        type: 'escrow.frozen',
        data: { orderId, disputeId, vendorId: row.vendorId, amountUGX: row.amountUGX.toNumber() },
      });
    }

    return frozen.map(toDomain);
  }

  async reconcileEscrowLedger(): Promise<{
    totalEscrowEntries: number;
    activeEscrowHoldUGX: number;
    disputeHoldUGX: number;
    releasedUGX: number;
    refundedUGX: number;
  }> {
    // Aggregated in the database rather than by loading every hold into memory
    // and summing — this collection grows without bound.
    const [total, grouped] = await Promise.all([
      prisma.escrowHold.count(),
      prisma.escrowHold.groupBy({ by: ['status'], _sum: { amountUGX: true } }),
    ]);

    const sumFor = (status: string): number =>
      grouped.find((g) => g.status === status)?._sum.amountUGX?.toNumber() ?? 0;

    return {
      totalEscrowEntries: total,
      activeEscrowHoldUGX: sumFor('in_escrow'),
      disputeHoldUGX: sumFor('dispute_hold'),
      releasedUGX: sumFor('released_to_vendor'),
      refundedUGX: sumFor('refunded_to_buyer'),
    };
  }
}

export const escrowService = new EscrowService();
