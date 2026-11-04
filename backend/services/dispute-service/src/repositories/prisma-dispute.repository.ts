import { randomUUID } from 'node:crypto';
import { Prisma } from '../generated/prisma/index.js';
import { prisma } from '../db/prisma.js';
import type {
  ClaimType,
  Dispute,
  DisputeEvidence,
  DisputeMessage,
  DisputeStatus,
  ResolutionAction,
} from '../models/dispute.model.js';
import type { DisputeUpdate, IDisputeRepository, NewDisputeMessage } from '../types/repositories.js';

// ─── Prisma-backed dispute repository ─────────────────────────────────────────
//
// The domain type carries ISO-8601 strings and plain numbers because that is
// what the Kafka envelopes, the downstream clients and the HTTP responses all
// expect; the database carries DateTime and Decimal. Every conversion lives in
// this file, so no call site has to know the difference — the same split
// payment-service's repository makes.

type Row = Prisma.DisputeGetPayload<{ include: { messages: true } }>;
type MessageRow = Row['messages'][number];

/** Statuses where the 72h seller-resolution clock is still running. */
export const SLA_BREACHABLE_STATUSES = ['OPENED', 'SELLER_RESPONDED'] as const;

const toNumber = (d: Prisma.Decimal): number => d.toNumber();

function toMessage(row: MessageRow): DisputeMessage {
  return {
    id: row.id,
    senderId: row.senderId,
    senderRole: row.senderRole,
    content: row.content,
    // The column is a non-null TEXT[] defaulting to {}, but the domain type
    // treats an empty attachment list as absent — which is what the Map-backed
    // version stored, since it simply never set the field.
    attachments: row.attachments.length > 0 ? row.attachments : undefined,
    sentAt: row.sentAt.toISOString(),
  };
}

function toDomain(row: Row): Dispute {
  return {
    id: row.id,
    disputeNumber: row.disputeNumber,
    orderId: row.orderId,
    subOrderId: row.subOrderId,
    buyerId: row.buyerId,
    sellerId: row.sellerId,
    claimType: row.claimType as ClaimType,
    description: row.description,
    evidence: (row.evidence as unknown as DisputeEvidence[]) ?? [],
    claimAmountUGX: toNumber(row.claimAmountUGX),
    status: row.status as DisputeStatus,
    resolutionAction: (row.resolutionAction as ResolutionAction | null) ?? undefined,
    refundAmountUGX: row.refundAmountUGX === null ? undefined : toNumber(row.refundAmountUGX),
    resolutionNote: row.resolutionNote ?? undefined,
    resolutionDeadline: row.resolutionDeadline.toISOString(),
    slaStatus: row.slaStatus,
    autoEscalated: row.autoEscalated,
    // Chronological, matching the push-order the Map-backed array had.
    messages: [...row.messages]
      .sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime())
      .map(toMessage),
    adminId: row.adminId ?? undefined,
    escalatedAt: row.escalatedAt?.toISOString() ?? undefined,
    resolvedAt: row.resolvedAt?.toISOString() ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toUpdateData(patch: DisputeUpdate): Prisma.DisputeUpdateInput {
  const data: Prisma.DisputeUpdateInput = {};

  if (patch.status !== undefined) data.status = patch.status;
  if (patch.resolutionAction !== undefined) data.resolutionAction = patch.resolutionAction;
  if (patch.refundAmountUGX !== undefined) data.refundAmountUGX = patch.refundAmountUGX;
  if (patch.resolutionNote !== undefined) data.resolutionNote = patch.resolutionNote;
  if (patch.slaStatus !== undefined) data.slaStatus = patch.slaStatus;
  if (patch.autoEscalated !== undefined) data.autoEscalated = patch.autoEscalated;
  if (patch.adminId !== undefined) data.adminId = patch.adminId;
  if (patch.escalatedAt !== undefined) {
    data.escalatedAt = patch.escalatedAt ? new Date(patch.escalatedAt) : null;
  }
  if (patch.resolvedAt !== undefined) {
    data.resolvedAt = patch.resolvedAt ? new Date(patch.resolvedAt) : null;
  }
  if (patch.updatedAt !== undefined) data.updatedAt = new Date(patch.updatedAt);

  return data;
}

/** P2025 is Prisma's "record required but not found" on update/delete. */
function isMissingRecord(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025';
}

/** Sentinel thrown inside a transaction so the outer catch maps it to null. */
function missingRecordError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Dispute not found', {
    code: 'P2025',
    clientVersion: Prisma.prismaVersion.client,
  });
}

export class PrismaDisputeRepository implements IDisputeRepository {
  async create(dispute: Dispute): Promise<Dispute> {
    const row = await prisma.dispute.create({
      data: {
        id: dispute.id,
        disputeNumber: dispute.disputeNumber,
        orderId: dispute.orderId,
        subOrderId: dispute.subOrderId ?? null,
        buyerId: dispute.buyerId,
        sellerId: dispute.sellerId,
        claimType: dispute.claimType,
        description: dispute.description,
        evidence: dispute.evidence as unknown as Prisma.InputJsonValue,
        claimAmountUGX: dispute.claimAmountUGX,
        status: dispute.status,
        resolutionDeadline: new Date(dispute.resolutionDeadline),
        slaStatus: dispute.slaStatus,
        autoEscalated: dispute.autoEscalated,
        createdAt: new Date(dispute.createdAt),
        updatedAt: new Date(dispute.updatedAt),
        // The opening message is written in the same statement, so a dispute
        // can never exist without the claim text that started it.
        messages: {
          create: dispute.messages.map((m) => ({
            id: m.id,
            senderId: m.senderId,
            senderRole: m.senderRole,
            content: m.content,
            attachments: m.attachments ?? [],
            sentAt: new Date(m.sentAt),
          })),
        },
      },
      include: { messages: true },
    });

    return toDomain(row);
  }

  async findById(id: string): Promise<Dispute | null> {
    const row = await prisma.dispute.findUnique({ where: { id }, include: { messages: true } });
    return row ? toDomain(row) : null;
  }

  async findByUser(userId: string, role: 'buyer' | 'seller'): Promise<Dispute[]> {
    const rows = await prisma.dispute.findMany({
      where: role === 'buyer' ? { buyerId: userId } : { sellerId: userId },
      include: { messages: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toDomain);
  }

  async findAll(): Promise<Dispute[]> {
    const rows = await prisma.dispute.findMany({
      include: { messages: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toDomain);
  }

  async findSlaCandidates(): Promise<Dispute[]> {
    const rows = await prisma.dispute.findMany({
      where: { status: { in: [...SLA_BREACHABLE_STATUSES] } },
      include: { messages: true },
      orderBy: { resolutionDeadline: 'asc' },
    });
    return rows.map(toDomain);
  }

  async update(id: string, patch: DisputeUpdate): Promise<Dispute | null> {
    try {
      const row = await prisma.dispute.update({
        where: { id },
        data: toUpdateData(patch),
        include: { messages: true },
      });
      return toDomain(row);
    } catch (err) {
      if (isMissingRecord(err)) return null;
      throw err;
    }
  }

  async appendEvidence(
    id: string,
    items: DisputeEvidence[],
    updatedAt: string,
  ): Promise<Dispute | null> {
    // Read-modify-write inside a transaction: evidence is a JSON array, so
    // there is no append operator to use instead, and two uploads landing
    // together would otherwise silently drop one.
    try {
      const row = await prisma.$transaction(async (tx) => {
        const current = await tx.dispute.findUnique({ where: { id }, select: { evidence: true } });
        if (!current) throw missingRecordError();

        const merged = [
          ...((current.evidence as unknown as DisputeEvidence[]) ?? []),
          ...items,
        ];

        return tx.dispute.update({
          where: { id },
          data: {
            evidence: merged as unknown as Prisma.InputJsonValue,
            updatedAt: new Date(updatedAt),
          },
          include: { messages: true },
        });
      });

      return toDomain(row);
    } catch (err) {
      if (isMissingRecord(err)) return null;
      throw err;
    }
  }

  async appendMessage(
    id: string,
    message: NewDisputeMessage,
    patch?: DisputeUpdate,
  ): Promise<Dispute | null> {
    // One statement covers both the nested message insert and the status
    // change, so a dispute can never show as SELLER_RESPONDED without the
    // response that caused it.
    try {
      const row = await prisma.dispute.update({
        where: { id },
        data: {
          ...(patch ? toUpdateData(patch) : {}),
          messages: {
            create: {
              id: randomUUID(),
              senderId: message.senderId,
              senderRole: message.senderRole,
              content: message.content,
              attachments: message.attachments ?? [],
              sentAt: new Date(message.sentAt),
            },
          },
        },
        include: { messages: true },
      });
      return toDomain(row);
    } catch (err) {
      if (isMissingRecord(err)) return null;
      throw err;
    }
  }
}

export const prismaDisputeRepository = new PrismaDisputeRepository();
