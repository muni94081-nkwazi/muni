import { Prisma } from '../generated/prisma/index.js';
import { prisma } from '../db/prisma.js';
import type { Fulfillment } from '../models/fulfillment.model.js';
import type { CashLedgerEntry, CodCollection } from '../models/cod.model.js';
import type { DigitalSignature, Rider } from '../models/rider.model.js';
import type {
  FulfillmentUpdate,
  ICodRepository,
  IFulfillmentRepository,
  IRiderRepository,
  TimelineEntry,
} from '../types/repositories.js';

// ─── Prisma-backed repositories ───────────────────────────────────────────────
//
// Domain types carry ISO-8601 strings and plain numbers; the database carries
// DateTime and Decimal. Every conversion lives here.

type FulfillmentRow = Prisma.FulfillmentGetPayload<{ include: { signatures: true } }>;
type CollectionRow = Prisma.CodCollectionGetPayload<Record<string, never>>;
type LedgerRow = Prisma.CashLedgerEntryGetPayload<Record<string, never>>;
type RiderRow = Prisma.RiderGetPayload<Record<string, never>>;
type SignatureRow = Prisma.DigitalSignatureGetPayload<Record<string, never>>;

const num = (d: Prisma.Decimal | null): number | undefined =>
  d === null ? undefined : d.toNumber();

function isMissingRecord(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025';
}

// ── Fulfillment ──────────────────────────────────────────────────────────────

function fulfillmentToDomain(row: FulfillmentRow): Fulfillment {
  return {
    id: row.id,
    orderId: row.orderId,
    subOrderId: row.subOrderId ?? undefined,
    sellerId: row.sellerId,
    type: row.type,
    provider: row.provider ?? undefined,
    warehouseId: row.warehouseId ?? undefined,
    warehouseLocation: row.warehouseLocation ?? undefined,
    status: row.status,
    items: row.items as Fulfillment['items'],
    shippingAddress: row.shippingAddress,
    trackingNumber: row.trackingNumber ?? undefined,
    estimatedDelivery: row.estimatedDelivery ?? undefined,
    timeline: row.timeline as Fulfillment['timeline'],
    paymentMethod: row.paymentMethod,
    codAmountDue: num(row.codAmountDue),
    codAmountCollected: num(row.codAmountCollected),
    codCurrency: row.codCurrency ?? undefined,
    codStatus: row.codStatus ?? undefined,
    riderId: row.riderId ?? undefined,
    // Derived from the relation — the old code kept a second copy of this on
    // the fulfillment itself, which could and did drift.
    signatures: row.signatures
      .sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime())
      .map((s) => ({
        id: s.id,
        riderId: s.riderId,
        signatureData: s.signatureData,
        recipientName: s.recipientName,
        capturedAt: s.capturedAt.toISOString(),
      })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function fulfillmentUpdateData(patch: FulfillmentUpdate): Prisma.FulfillmentUpdateInput {
  const data: Prisma.FulfillmentUpdateInput = {};
  if (patch.status !== undefined) data.status = patch.status;
  if (patch.trackingNumber !== undefined) data.trackingNumber = patch.trackingNumber;
  if (patch.riderId !== undefined) data.riderId = patch.riderId;
  if (patch.paymentMethod !== undefined) data.paymentMethod = patch.paymentMethod;
  if (patch.codAmountDue !== undefined) data.codAmountDue = patch.codAmountDue;
  if (patch.codAmountCollected !== undefined) data.codAmountCollected = patch.codAmountCollected;
  if (patch.codCurrency !== undefined) data.codCurrency = patch.codCurrency;
  if (patch.codStatus !== undefined) data.codStatus = patch.codStatus;
  if (patch.updatedAt !== undefined) data.updatedAt = new Date(patch.updatedAt);
  return data;
}

export class PrismaFulfillmentRepository implements IFulfillmentRepository {
  async findBySubOrder(subOrderId: string): Promise<Fulfillment | null> {
    const row = await prisma.fulfillment.findFirst({ where: { subOrderId }, include: { signatures: true } });
    return row ? fulfillmentToDomain(row) : null;
  }

  async create(f: Fulfillment): Promise<Fulfillment> {
    const row = await prisma.fulfillment.create({
      data: {
        id: f.id,
        orderId: f.orderId,
        subOrderId: f.subOrderId ?? null,
        sellerId: f.sellerId,
        type: f.type,
        provider: f.provider ?? null,
        warehouseId: f.warehouseId ?? null,
        warehouseLocation: f.warehouseLocation ?? null,
        status: f.status,
        items: f.items as unknown as Prisma.InputJsonValue,
        shippingAddress: (f.shippingAddress ?? {}) as Prisma.InputJsonValue,
        timeline: f.timeline as unknown as Prisma.InputJsonValue,
        trackingNumber: f.trackingNumber ?? null,
        estimatedDelivery: f.estimatedDelivery ?? null,
        paymentMethod: f.paymentMethod,
        codAmountDue: f.codAmountDue ?? null,
        codAmountCollected: f.codAmountCollected ?? null,
        codCurrency: f.codCurrency ?? null,
        codStatus: f.codStatus ?? null,
        riderId: f.riderId ?? null,
        createdAt: new Date(f.createdAt),
        updatedAt: new Date(f.updatedAt),
      },
      include: { signatures: true },
    });
    return fulfillmentToDomain(row);
  }

  async findById(id: string): Promise<Fulfillment | null> {
    const row = await prisma.fulfillment.findUnique({ where: { id }, include: { signatures: true } });
    return row ? fulfillmentToDomain(row) : null;
  }

  async findByOrder(orderId: string): Promise<Fulfillment[]> {
    const rows = await prisma.fulfillment.findMany({
      where: { orderId },
      include: { signatures: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(fulfillmentToDomain);
  }

  async findBySeller(sellerId: string): Promise<Fulfillment[]> {
    const rows = await prisma.fulfillment.findMany({
      where: { sellerId },
      include: { signatures: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(fulfillmentToDomain);
  }

  async findByRider(riderId: string): Promise<Fulfillment[]> {
    const rows = await prisma.fulfillment.findMany({
      where: { riderId },
      include: { signatures: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(fulfillmentToDomain);
  }

  async update(id: string, patch: FulfillmentUpdate): Promise<Fulfillment | null> {
    try {
      const row = await prisma.fulfillment.update({
        where: { id },
        data: fulfillmentUpdateData(patch),
        include: { signatures: true },
      });
      return fulfillmentToDomain(row);
    } catch (err) {
      if (isMissingRecord(err)) return null;
      throw err;
    }
  }

  async appendTimeline(
    id: string,
    entry: TimelineEntry,
    patch?: FulfillmentUpdate,
  ): Promise<Fulfillment | null> {
    // Read-modify-write in a transaction: timeline is a JSON array, so there
    // is no append operator, and two concurrent status changes would
    // otherwise lose one entry.
    try {
      const row = await prisma.$transaction(async (tx) => {
        const current = await tx.fulfillment.findUnique({ where: { id }, select: { timeline: true } });
        if (!current) {
          throw new Prisma.PrismaClientKnownRequestError('Fulfillment not found', {
            code: 'P2025',
            clientVersion: Prisma.prismaVersion.client,
          });
        }

        const timeline = [...((current.timeline as unknown as TimelineEntry[]) ?? []), entry];

        return tx.fulfillment.update({
          where: { id },
          data: {
            ...(patch ? fulfillmentUpdateData(patch) : {}),
            timeline: timeline as unknown as Prisma.InputJsonValue,
          },
          include: { signatures: true },
        });
      });
      return fulfillmentToDomain(row);
    } catch (err) {
      if (isMissingRecord(err)) return null;
      throw err;
    }
  }

  async setLastTimelineNote(id: string, note: string): Promise<Fulfillment | null> {
    try {
      const row = await prisma.$transaction(async (tx) => {
        const current = await tx.fulfillment.findUnique({ where: { id }, select: { timeline: true } });
        if (!current) {
          throw new Prisma.PrismaClientKnownRequestError('Fulfillment not found', {
            code: 'P2025',
            clientVersion: Prisma.prismaVersion.client,
          });
        }

        const timeline = [...((current.timeline as unknown as TimelineEntry[]) ?? [])];
        if (timeline.length > 0) timeline[timeline.length - 1]!.note = note;

        return tx.fulfillment.update({
          where: { id },
          data: { timeline: timeline as unknown as Prisma.InputJsonValue },
          include: { signatures: true },
        });
      });
      return fulfillmentToDomain(row);
    } catch (err) {
      if (isMissingRecord(err)) return null;
      throw err;
    }
  }
}

// ── COD ──────────────────────────────────────────────────────────────────────

function collectionToDomain(row: CollectionRow): CodCollection {
  return {
    id: row.id,
    fulfillmentId: row.fulfillmentId,
    orderId: row.orderId,
    riderId: row.riderId,
    amountDue: row.amountDue.toNumber(),
    amountCollected: row.amountCollected.toNumber(),
    currency: row.currency,
    variance: row.variance.toNumber(),
    verificationStatus: row.verificationStatus,
    notes: row.notes ?? undefined,
    collectedAt: row.collectedAt.toISOString(),
  };
}

function ledgerToDomain(row: LedgerRow): CashLedgerEntry {
  return {
    riderId: row.riderId,
    date: row.date,
    totalDue: row.totalDue.toNumber(),
    totalCollected: row.totalCollected.toNumber(),
    totalRemitted: row.totalRemitted.toNumber(),
    variance: row.variance.toNumber(),
    collectionIds: row.collectionIds,
    status: row.status,
    reconciledAt: row.reconciledAt?.toISOString(),
    reconciledBy: row.reconciledBy ?? undefined,
  };
}

export class PrismaCodRepository implements ICodRepository {
  async createCollection(c: CodCollection): Promise<CodCollection> {
    const row = await prisma.codCollection.create({
      data: {
        id: c.id,
        fulfillmentId: c.fulfillmentId,
        orderId: c.orderId,
        riderId: c.riderId,
        amountDue: c.amountDue,
        amountCollected: c.amountCollected,
        currency: c.currency,
        variance: c.variance,
        verificationStatus: c.verificationStatus,
        notes: c.notes ?? null,
        collectedAt: new Date(c.collectedAt),
      },
    });
    return collectionToDomain(row);
  }

  async findLedger(ledgerKey: string): Promise<CashLedgerEntry | null> {
    const row = await prisma.cashLedgerEntry.findUnique({ where: { ledgerKey } });
    return row ? ledgerToDomain(row) : null;
  }

  async accumulateLedger(
    ledgerKey: string,
    riderId: string,
    date: string,
    amountDue: number,
    amountCollected: number,
    collectionId: string,
  ): Promise<CashLedgerEntry> {
    // Atomic increments rather than read-then-write. The Map version read the
    // entry, added to it and wrote it back; two riders' handsets posting at
    // the same moment would both read the same totals and one collection's
    // cash would vanish from the day's books.
    const row = await prisma.cashLedgerEntry.upsert({
      where: { ledgerKey },
      create: {
        ledgerKey,
        riderId,
        date,
        totalDue: amountDue,
        totalCollected: amountCollected,
        totalRemitted: 0,
        variance: 0,
        collectionIds: [collectionId],
        status: 'OPEN',
      },
      update: {
        totalDue: { increment: amountDue },
        totalCollected: { increment: amountCollected },
        collectionIds: { push: collectionId },
      },
    });
    return ledgerToDomain(row);
  }

  async updateLedgerReconciliation(
    ledgerKey: string,
    patch: Pick<
      CashLedgerEntry,
      'totalRemitted' | 'variance' | 'status' | 'reconciledAt' | 'reconciledBy'
    >,
  ): Promise<CashLedgerEntry | null> {
    try {
      const row = await prisma.cashLedgerEntry.update({
        where: { ledgerKey },
        data: {
          totalRemitted: patch.totalRemitted,
          variance: patch.variance,
          status: patch.status,
          reconciledAt: patch.reconciledAt ? new Date(patch.reconciledAt) : null,
          reconciledBy: patch.reconciledBy ?? null,
        },
      });
      return ledgerToDomain(row);
    } catch (err) {
      if (isMissingRecord(err)) return null;
      throw err;
    }
  }

  async listUnreconciledLedgers(): Promise<CashLedgerEntry[]> {
    const rows = await prisma.cashLedgerEntry.findMany({
      where: { status: { not: 'RECONCILED' } },
      orderBy: [{ date: 'desc' }, { riderId: 'asc' }],
    });
    return rows.map(ledgerToDomain);
  }
}

// ── Riders ───────────────────────────────────────────────────────────────────

function riderToDomain(row: RiderRow): Rider {
  return {
    id: row.id,
    name: row.name ?? undefined,
    phone: row.phone ?? undefined,
    vehicleType: row.vehicleType,
    status: row.status,
    activeFulfillmentIds: row.activeFulfillmentIds,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function signatureToDomain(row: SignatureRow): DigitalSignature {
  return {
    id: row.id,
    fulfillmentId: row.fulfillmentId,
    riderId: row.riderId,
    signatureData: row.signatureData,
    recipientName: row.recipientName,
    capturedAt: row.capturedAt.toISOString(),
    location: (row.location as DigitalSignature['location']) ?? undefined,
  };
}

export class PrismaRiderRepository implements IRiderRepository {
  async ensure(riderId: string): Promise<Rider> {
    const now = new Date();
    // Upsert with an empty update: creates on first sight, returns the
    // existing row afterwards, in one round trip and with no race.
    const row = await prisma.rider.upsert({
      where: { id: riderId },
      create: {
        id: riderId,
        vehicleType: 'BODA',
        status: 'AVAILABLE',
        activeFulfillmentIds: [],
        createdAt: now,
        updatedAt: now,
      },
      update: {},
    });
    return riderToDomain(row);
  }

  async findById(riderId: string): Promise<Rider | null> {
    const row = await prisma.rider.findUnique({ where: { id: riderId } });
    return row ? riderToDomain(row) : null;
  }

  async update(
    riderId: string,
    patch: Partial<Pick<Rider, 'name' | 'phone' | 'vehicleType' | 'status' | 'activeFulfillmentIds' | 'updatedAt'>>,
  ): Promise<Rider | null> {
    const data: Prisma.RiderUpdateInput = {};
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.phone !== undefined) data.phone = patch.phone;
    if (patch.vehicleType !== undefined) data.vehicleType = patch.vehicleType;
    if (patch.status !== undefined) data.status = patch.status;
    if (patch.activeFulfillmentIds !== undefined) data.activeFulfillmentIds = patch.activeFulfillmentIds;
    if (patch.updatedAt !== undefined) data.updatedAt = new Date(patch.updatedAt);

    try {
      const row = await prisma.rider.update({ where: { id: riderId }, data });
      return riderToDomain(row);
    } catch (err) {
      if (isMissingRecord(err)) return null;
      throw err;
    }
  }

  async createSignature(s: DigitalSignature): Promise<DigitalSignature> {
    const row = await prisma.digitalSignature.create({
      data: {
        id: s.id,
        fulfillmentId: s.fulfillmentId,
        riderId: s.riderId,
        signatureData: s.signatureData,
        recipientName: s.recipientName,
        location: (s.location ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        capturedAt: new Date(s.capturedAt),
      },
    });
    return signatureToDomain(row);
  }
}

export const prismaFulfillmentRepository = new PrismaFulfillmentRepository();
export const prismaCodRepository = new PrismaCodRepository();
export const prismaRiderRepository = new PrismaRiderRepository();
