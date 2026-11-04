import { Prisma } from '../generated/prisma/index.js';
import { prisma } from '../db/prisma.js';
import type { ProtectionClaim } from '../models/buyer-protection.model.js';
import type {
  EscrowHold,
  EscrowHoldStatus,
  ReleaseTrigger,
  RefundTrigger,
} from '../models/escrow-hold.model.js';
import type {
  ClaimUpdate,
  EscrowHoldUpdate,
  IClaimRepository,
  IEscrowHoldRepository,
} from '../types/repositories.js';

// ─── Prisma-backed repositories ───────────────────────────────────────────────
//
// The domain types carry ISO-8601 strings and plain numbers; the database
// carries DateTime and Decimal. Every conversion lives here.

type ClaimRow = Prisma.ProtectionClaimGetPayload<Record<string, never>>;
type HoldRow = Prisma.EscrowHoldGetPayload<Record<string, never>>;

const iso = (d: Date | null): string | null => d?.toISOString() ?? null;

function isMissingRecord(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025';
}

// ── Claims ───────────────────────────────────────────────────────────────────

function claimToDomain(row: ClaimRow): ProtectionClaim {
  return {
    id: row.id,
    claimNumber: row.claimNumber,
    orderId: row.orderId,
    userId: row.userId,
    productId: row.productId,
    reason: row.reason as ProtectionClaim['reason'],
    claimAmountUGX: row.claimAmountUGX.toNumber(),
    status: row.status as ProtectionClaim['status'],
    adminNotes: row.adminNotes ?? undefined,
    resolutionNotes: row.resolutionNotes ?? undefined,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: iso(row.resolvedAt) ?? undefined,
  };
}

export class PrismaClaimRepository implements IClaimRepository {
  async create(claim: ProtectionClaim): Promise<ProtectionClaim> {
    const row = await prisma.protectionClaim.create({
      data: {
        id: claim.id,
        claimNumber: claim.claimNumber,
        orderId: claim.orderId,
        userId: claim.userId,
        productId: claim.productId,
        reason: claim.reason,
        claimAmountUGX: claim.claimAmountUGX,
        status: claim.status,
        adminNotes: claim.adminNotes ?? null,
        resolutionNotes: claim.resolutionNotes ?? null,
        createdAt: new Date(claim.createdAt),
        resolvedAt: claim.resolvedAt ? new Date(claim.resolvedAt) : null,
      },
    });
    return claimToDomain(row);
  }

  async findById(id: string): Promise<ProtectionClaim | null> {
    const row = await prisma.protectionClaim.findUnique({ where: { id } });
    return row ? claimToDomain(row) : null;
  }

  async findByUser(userId: string): Promise<ProtectionClaim[]> {
    const rows = await prisma.protectionClaim.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(claimToDomain);
  }

  async findAll(): Promise<ProtectionClaim[]> {
    const rows = await prisma.protectionClaim.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map(claimToDomain);
  }

  async update(id: string, patch: ClaimUpdate): Promise<ProtectionClaim | null> {
    const data: Prisma.ProtectionClaimUpdateInput = {};
    if (patch.status !== undefined) data.status = patch.status;
    if (patch.adminNotes !== undefined) data.adminNotes = patch.adminNotes;
    if (patch.resolutionNotes !== undefined) data.resolutionNotes = patch.resolutionNotes;
    if (patch.resolvedAt !== undefined) {
      data.resolvedAt = patch.resolvedAt ? new Date(patch.resolvedAt) : null;
    }

    try {
      const row = await prisma.protectionClaim.update({ where: { id }, data });
      return claimToDomain(row);
    } catch (err) {
      if (isMissingRecord(err)) return null;
      throw err;
    }
  }
}

// ── Escrow holds ─────────────────────────────────────────────────────────────

function holdToDomain(row: HoldRow): EscrowHold {
  return {
    id: row.id,
    orderId: row.orderId,
    subOrderId: row.subOrderId,
    buyerId: row.buyerId,
    sellerId: row.sellerId,
    amount: row.amount.toNumber(),
    currency: row.currency,
    status: row.status as EscrowHoldStatus,
    deliveredAt: iso(row.deliveredAt),
    autoReleaseAt: iso(row.autoReleaseAt),
    expectedDeliveryAt: iso(row.expectedDeliveryAt),
    activeDisputeId: row.activeDisputeId,
    releasedAt: iso(row.releasedAt),
    releaseTrigger: (row.releaseTrigger as ReleaseTrigger | null) ?? null,
    refundedAt: iso(row.refundedAt),
    refundTrigger: (row.refundTrigger as RefundTrigger | null) ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Mirrors holdKey() in escrow-hold.service.ts — the Map's key function. */
export function holdKeyFor(orderId: string, subOrderId?: string | null): string {
  return subOrderId ? `${orderId}:${subOrderId}` : orderId;
}

function holdToUpdateData(patch: EscrowHoldUpdate): Prisma.EscrowHoldUpdateInput {
  const data: Prisma.EscrowHoldUpdateInput = {};
  const date = (v: string | null | undefined) => (v ? new Date(v) : null);

  if (patch.status !== undefined) data.status = patch.status;
  if (patch.deliveredAt !== undefined) data.deliveredAt = date(patch.deliveredAt);
  if (patch.autoReleaseAt !== undefined) data.autoReleaseAt = date(patch.autoReleaseAt);
  if (patch.expectedDeliveryAt !== undefined) data.expectedDeliveryAt = date(patch.expectedDeliveryAt);
  if (patch.activeDisputeId !== undefined) data.activeDisputeId = patch.activeDisputeId;
  if (patch.releasedAt !== undefined) data.releasedAt = date(patch.releasedAt);
  if (patch.releaseTrigger !== undefined) data.releaseTrigger = patch.releaseTrigger;
  if (patch.refundedAt !== undefined) data.refundedAt = date(patch.refundedAt);
  if (patch.refundTrigger !== undefined) data.refundTrigger = patch.refundTrigger;
  if (patch.updatedAt !== undefined) data.updatedAt = new Date(patch.updatedAt);

  return data;
}

export class PrismaEscrowHoldRepository implements IEscrowHoldRepository {
  async upsert(hold: EscrowHold): Promise<EscrowHold> {
    const key = holdKeyFor(hold.orderId, hold.subOrderId);

    const payload = {
      orderId: hold.orderId,
      subOrderId: hold.subOrderId ?? null,
      buyerId: hold.buyerId,
      sellerId: hold.sellerId,
      amount: hold.amount,
      currency: hold.currency,
      status: hold.status,
      deliveredAt: hold.deliveredAt ? new Date(hold.deliveredAt) : null,
      autoReleaseAt: hold.autoReleaseAt ? new Date(hold.autoReleaseAt) : null,
      expectedDeliveryAt: hold.expectedDeliveryAt ? new Date(hold.expectedDeliveryAt) : null,
      activeDisputeId: hold.activeDisputeId ?? null,
      releasedAt: hold.releasedAt ? new Date(hold.releasedAt) : null,
      releaseTrigger: hold.releaseTrigger ?? null,
      refundedAt: hold.refundedAt ? new Date(hold.refundedAt) : null,
      refundTrigger: hold.refundTrigger ?? null,
      updatedAt: new Date(hold.updatedAt),
    };

    const row = await prisma.escrowHold.upsert({
      where: { holdKey: key },
      create: { id: hold.id, holdKey: key, createdAt: new Date(hold.createdAt), ...payload },
      update: payload,
    });

    return holdToDomain(row);
  }

  async findByKey(holdKey: string): Promise<EscrowHold | null> {
    const row = await prisma.escrowHold.findUnique({ where: { holdKey } });
    return row ? holdToDomain(row) : null;
  }

  async findAll(): Promise<EscrowHold[]> {
    const rows = await prisma.escrowHold.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map(holdToDomain);
  }

  async findBySeller(sellerId: string): Promise<EscrowHold[]> {
    const rows = await prisma.escrowHold.findMany({
      where: { sellerId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(holdToDomain);
  }

  async findDueForAutoRelease(now: string): Promise<EscrowHold[]> {
    const rows = await prisma.escrowHold.findMany({
      where: { status: 'HELD', autoReleaseAt: { not: null, lte: new Date(now) } },
      orderBy: { autoReleaseAt: 'asc' },
    });
    return rows.map(holdToDomain);
  }

  async update(holdKey: string, patch: EscrowHoldUpdate): Promise<EscrowHold | null> {
    try {
      const row = await prisma.escrowHold.update({
        where: { holdKey },
        data: holdToUpdateData(patch),
      });
      return holdToDomain(row);
    } catch (err) {
      if (isMissingRecord(err)) return null;
      throw err;
    }
  }
}

export const prismaClaimRepository = new PrismaClaimRepository();
export const prismaEscrowHoldRepository = new PrismaEscrowHoldRepository();
