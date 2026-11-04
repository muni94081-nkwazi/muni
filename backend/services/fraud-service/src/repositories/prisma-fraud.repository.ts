import { Prisma } from '../generated/prisma/index.js';
import { prisma } from '../db/prisma.js';
import type { FraudCase, FraudDecision, FraudStats, IFraudRepository } from '../types/repositories.js';

// ─── Prisma-backed fraud repository ───────────────────────────────────────────

type Row = Prisma.FraudCaseGetPayload<Record<string, never>>;

const toDomain = (row: Row): FraudCase => ({
  orderId: row.orderId,
  score: row.score,
  decision: row.decision,
  triggeredRules: row.triggeredRules,
  reviewedBy: row.reviewedBy ?? undefined,
  reviewedAt: row.reviewedAt?.toISOString(),
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export class PrismaFraudRepository implements IFraudRepository {
  async upsertCase(c: FraudCase): Promise<FraudCase> {
    const row = await prisma.fraudCase.upsert({
      where: { orderId: c.orderId },
      create: {
        orderId: c.orderId,
        score: c.score,
        decision: c.decision,
        triggeredRules: c.triggeredRules,
        createdAt: new Date(c.createdAt),
        updatedAt: new Date(c.updatedAt),
      },
      update: {
        score: c.score,
        decision: c.decision,
        triggeredRules: c.triggeredRules,
        updatedAt: new Date(c.updatedAt),
      },
    });
    return toDomain(row);
  }

  async findCase(orderId: string): Promise<FraudCase | null> {
    const row = await prisma.fraudCase.findUnique({ where: { orderId } });
    return row ? toDomain(row) : null;
  }

  async listCasesForReview(): Promise<FraudCase[]> {
    const rows = await prisma.fraudCase.findMany({
      where: { decision: 'REVIEW' },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toDomain);
  }

  async listAllCases(): Promise<FraudCase[]> {
    const rows = await prisma.fraudCase.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map(toDomain);
  }

  async updateDecision(
    orderId: string,
    decision: FraudDecision,
    reviewedBy: string | undefined,
    reviewedAt: string,
  ): Promise<FraudCase | null> {
    try {
      const row = await prisma.fraudCase.update({
        where: { orderId },
        data: {
          decision,
          reviewedBy: reviewedBy ?? null,
          reviewedAt: new Date(reviewedAt),
          updatedAt: new Date(reviewedAt),
        },
      });
      return toDomain(row);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') return null;
      throw err;
    }
  }

  async countByDecision(): Promise<FraudStats> {
    // Counted from the cases themselves, so the figures cannot drift from the
    // decisions they describe.
    const grouped = await prisma.fraudCase.groupBy({
      by: ['decision'],
      _count: { _all: true },
    });

    const stats: FraudStats = { allowed: 0, reviewed: 0, blocked: 0 };

    for (const row of grouped) {
      if (row.decision === 'ALLOW') stats.allowed = row._count._all;
      if (row.decision === 'REVIEW') stats.reviewed = row._count._all;
      if (row.decision === 'BLOCK') stats.blocked = row._count._all;
    }

    return stats;
  }
}

export const prismaFraudRepository = new PrismaFraudRepository();
