import { Prisma } from '../generated/prisma/index.js';
import { prisma } from '../db/prisma.js';
import type {
  LoyaltyRedemption,
  LoyaltyReferral,
  LoyaltyReward,
  LoyaltyTransaction,
  LoyaltyUser,
} from '../models/loyalty.model.js';
import type { ILoyaltyRepository } from '../types/repositories.js';

// ─── Prisma-backed loyalty repository ─────────────────────────────────────────

type UserRow = Prisma.LoyaltyUserGetPayload<Record<string, never>>;
type TxRow = Prisma.LoyaltyTransactionGetPayload<Record<string, never>>;
type RewardRow = Prisma.LoyaltyRewardGetPayload<Record<string, never>>;
type RedemptionRow = Prisma.LoyaltyRedemptionGetPayload<Record<string, never>>;
type ReferralRow = Prisma.LoyaltyReferralGetPayload<Record<string, never>>;

const userToDomain = (row: UserRow): LoyaltyUser => ({
  userId: row.userId,
  points: row.points,
  tier: row.tier,
  tierProgress: row.tierProgress,
  lifetimePoints: row.lifetimePoints,
  updatedAt: row.updatedAt.toISOString(),
});

const txToDomain = (row: TxRow): LoyaltyTransaction => ({
  id: row.id,
  userId: row.userId,
  points: row.points,
  type: row.type,
  source: row.source,
  referenceId: row.referenceId ?? undefined,
  description: row.description,
  createdAt: row.createdAt.toISOString(),
});

const rewardToDomain = (row: RewardRow): LoyaltyReward => ({
  id: row.id,
  name: row.name,
  description: row.description,
  pointsCost: row.pointsCost,
  type: row.type,
  value: row.value,
  isActive: row.isActive,
});

const redemptionToDomain = (row: RedemptionRow): LoyaltyRedemption => ({
  id: row.id,
  userId: row.userId,
  rewardId: row.rewardId,
  rewardName: row.rewardName,
  pointsSpent: row.pointsSpent,
  code: row.code,
  status: row.status,
  redeemedAt: row.redeemedAt.toISOString(),
});

const referralToDomain = (row: ReferralRow): LoyaltyReferral => ({
  id: row.id,
  referrerId: row.referrerId,
  refereeId: row.refereeId ?? undefined,
  referralCode: row.referralCode,
  status: row.status,
  rewardPoints: row.rewardPoints,
  createdAt: row.createdAt.toISOString(),
});

export class PrismaLoyaltyRepository implements ILoyaltyRepository {
  async ensureUser(userId: string, welcome: LoyaltyUser): Promise<LoyaltyUser> {
    // Upsert with an empty update: creates the member with their welcome
    // bonus on first sight, returns the existing row every time after.
    const row = await prisma.loyaltyUser.upsert({
      where: { userId },
      create: {
        userId,
        points: welcome.points,
        tier: welcome.tier,
        tierProgress: welcome.tierProgress,
        lifetimePoints: welcome.lifetimePoints,
        updatedAt: new Date(welcome.updatedAt),
      },
      update: {},
    });
    return userToDomain(row);
  }

  async findUser(userId: string): Promise<LoyaltyUser | null> {
    const row = await prisma.loyaltyUser.findUnique({ where: { userId } });
    return row ? userToDomain(row) : null;
  }

  async addPoints(
    userId: string,
    delta: number,
    tier: LoyaltyUser['tier'],
    tierProgress: number,
    updatedAt: string,
  ): Promise<LoyaltyUser | null> {
    try {
      const row = await prisma.loyaltyUser.update({
        where: { userId },
        data: {
          points: { increment: delta },
          lifetimePoints: { increment: delta },
          tier,
          tierProgress,
          updatedAt: new Date(updatedAt),
        },
      });
      return userToDomain(row);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') return null;
      throw err;
    }
  }

  async spendPoints(userId: string, cost: number, updatedAt: string): Promise<LoyaltyUser | null> {
    // The predicate is the lock: Postgres evaluates `points >= cost` under the
    // row lock the UPDATE itself takes, so there is no window between the
    // check and the write in which a second redemption can spend the same
    // points. Zero rows updated means the balance no longer covers it.
    const updated = await prisma.loyaltyUser.updateMany({
      where: { userId, points: { gte: cost } },
      data: { points: { decrement: cost }, updatedAt: new Date(updatedAt) },
    });

    if (updated.count === 0) return null;

    const row = await prisma.loyaltyUser.findUnique({ where: { userId } });
    return row ? userToDomain(row) : null;
  }

  async createTransaction(tx: LoyaltyTransaction): Promise<LoyaltyTransaction> {
    const row = await prisma.loyaltyTransaction.create({
      data: {
        id: tx.id,
        userId: tx.userId,
        points: tx.points,
        type: tx.type,
        source: tx.source,
        referenceId: tx.referenceId ?? null,
        description: tx.description,
        createdAt: new Date(tx.createdAt),
      },
    });
    return txToDomain(row);
  }

  async findTransactions(userId: string): Promise<LoyaltyTransaction[]> {
    const rows = await prisma.loyaltyTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(txToDomain);
  }

  async findActiveRewards(): Promise<LoyaltyReward[]> {
    const rows = await prisma.loyaltyReward.findMany({
      where: { isActive: true },
      orderBy: { pointsCost: 'asc' },
    });
    return rows.map(rewardToDomain);
  }

  async findReward(rewardId: string): Promise<LoyaltyReward | null> {
    const row = await prisma.loyaltyReward.findUnique({ where: { id: rewardId } });
    return row ? rewardToDomain(row) : null;
  }

  async createRedemption(r: LoyaltyRedemption): Promise<LoyaltyRedemption> {
    const row = await prisma.loyaltyRedemption.create({
      data: {
        id: r.id,
        userId: r.userId,
        rewardId: r.rewardId,
        rewardName: r.rewardName,
        pointsSpent: r.pointsSpent,
        code: r.code,
        status: r.status,
        redeemedAt: new Date(r.redeemedAt),
      },
    });
    return redemptionToDomain(row);
  }

  async findRedemptions(userId: string): Promise<LoyaltyRedemption[]> {
    const rows = await prisma.loyaltyRedemption.findMany({
      where: { userId },
      orderBy: { redeemedAt: 'desc' },
    });
    return rows.map(redemptionToDomain);
  }

  async createReferral(r: LoyaltyReferral): Promise<LoyaltyReferral> {
    const row = await prisma.loyaltyReferral.create({
      data: {
        referralCode: r.referralCode,
        id: r.id,
        referrerId: r.referrerId,
        refereeId: r.refereeId ?? null,
        status: r.status,
        rewardPoints: r.rewardPoints,
        createdAt: new Date(r.createdAt),
      },
    });
    return referralToDomain(row);
  }

  async findReferralByCode(code: string): Promise<LoyaltyReferral | null> {
    const row = await prisma.loyaltyReferral.findUnique({ where: { referralCode: code } });
    return row ? referralToDomain(row) : null;
  }
}

export const prismaLoyaltyRepository = new PrismaLoyaltyRepository();
