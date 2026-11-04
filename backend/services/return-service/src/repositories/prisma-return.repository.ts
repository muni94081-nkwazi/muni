import { randomUUID } from 'node:crypto';
import { Prisma } from '../generated/prisma/index.js';
import { prisma } from '../db/prisma.js';
import type { ReturnRequest, ReturnStatus } from '../models/return.model.js';
import type { IReturnRepository } from '../types/repositories.js';

// ─── Prisma-backed return repository ──────────────────────────────────────────
//
// The domain type carries ISO-8601 strings and plain numbers because that is
// what the Kafka envelopes and HTTP responses expect; the database carries
// DateTime and Decimal. Every conversion lives here.

type Row = Prisma.ReturnRequestGetPayload<{ include: { items: true } }>;

function toDomain(row: Row): ReturnRequest {
  return {
    id: row.id,
    orderId: row.orderId,
    userId: row.userId,
    sellerId: row.sellerId,
    items: row.items.map((i) => ({
      orderItemId: i.orderItemId,
      quantity: i.quantity,
      reason: i.reason,
    })),
    description: row.description ?? undefined,
    refundMethod: row.refundMethod,
    refundAmount: row.refundAmount === null ? null : row.refundAmount.toNumber(),
    currency: row.currency,
    status: row.status as ReturnStatus,
    isAutoApproved: row.isAutoApproved,
    guaranteeBadge: row.guaranteeBadge,
    requestedAt: row.requestedAt.toISOString(),
    approvedAt: row.approvedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function isMissingRecord(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025';
}

export class PrismaReturnRepository implements IReturnRepository {
  async create(request: ReturnRequest): Promise<ReturnRequest> {
    const row = await prisma.returnRequest.create({
      data: {
        id: request.id,
        orderId: request.orderId,
        userId: request.userId,
        sellerId: request.sellerId,
        description: request.description ?? null,
        refundMethod: request.refundMethod,
        refundAmount: request.refundAmount ?? null,
        currency: request.currency ?? null,
        status: request.status,
        isAutoApproved: request.isAutoApproved,
        guaranteeBadge: request.guaranteeBadge,
        requestedAt: new Date(request.requestedAt),
        approvedAt: request.approvedAt ? new Date(request.approvedAt) : null,
        updatedAt: new Date(request.updatedAt),
        // Line items go in the same statement: a return that names no items is
        // not a return, and the two must never be separately observable.
        items: {
          create: request.items.map((i) => ({
            id: randomUUID(),
            orderItemId: i.orderItemId,
            quantity: i.quantity,
            reason: i.reason,
          })),
        },
      },
      include: { items: true },
    });

    return toDomain(row);
  }

  async findById(id: string): Promise<ReturnRequest | null> {
    const row = await prisma.returnRequest.findUnique({ where: { id }, include: { items: true } });
    return row ? toDomain(row) : null;
  }

  async findByUser(userId: string): Promise<ReturnRequest[]> {
    const rows = await prisma.returnRequest.findMany({
      where: { userId },
      include: { items: true },
      orderBy: { requestedAt: 'desc' },
    });
    return rows.map(toDomain);
  }

  async findBySeller(sellerId: string): Promise<ReturnRequest[]> {
    const rows = await prisma.returnRequest.findMany({
      where: { sellerId },
      include: { items: true },
      orderBy: { requestedAt: 'desc' },
    });
    return rows.map(toDomain);
  }

  async findAll(): Promise<ReturnRequest[]> {
    const rows = await prisma.returnRequest.findMany({
      include: { items: true },
      orderBy: { requestedAt: 'desc' },
    });
    return rows.map(toDomain);
  }

  async updateStatus(
    id: string,
    status: ReturnStatus,
    updatedAt: string,
  ): Promise<ReturnRequest | null> {
    try {
      const row = await prisma.returnRequest.update({
        where: { id },
        // Deliberately does not touch approvedAt, matching the Map version:
        // only auto-approval at creation ever set it, so a return a seller
        // approves by hand still has approvedAt null. That is a real gap, but
        // closing it here would be a behaviour change smuggled into a
        // persistence swap — worth its own commit, not this one.
        data: { status, updatedAt: new Date(updatedAt) },
        include: { items: true },
      });
      return toDomain(row);
    } catch (err) {
      if (isMissingRecord(err)) return null;
      throw err;
    }
  }
}

export const prismaReturnRepository = new PrismaReturnRepository();
