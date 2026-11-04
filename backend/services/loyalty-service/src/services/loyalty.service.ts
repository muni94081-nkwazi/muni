import { randomUUID } from 'node:crypto';
import type {
  LoyaltyUser,
  LoyaltyTransaction,
  LoyaltyReward,
  LoyaltyRedemption,
  LoyaltyReferral,
  LoyaltyTier,
} from '../models/loyalty.model.js';
import { publish } from '../../../../shared/kafka/producer.js';
import { prismaLoyaltyRepository } from '../repositories/prisma-loyalty.repository.js';
import type { ILoyaltyRepository } from '../types/repositories.js';

// ─── Loyalty service ──────────────────────────────────────────────────────────
//
// State lives in Postgres behind ILoyaltyRepository. Five Maps went, and with
// them the risk that a restart either wiped a customer's earned balance or
// resurrected points they had already spent.
//
// The reward catalogue moved into the database too, seeded by the initial
// migration with the same two rewards that used to be hardcoded here.

const WELCOME_BONUS_POINTS = 250;

export class LoyaltyService {
  constructor(private readonly repo: ILoyaltyRepository = prismaLoyaltyRepository) {}

  private calculateTier(lifetimePoints: number): { tier: LoyaltyTier; progress: number } {
    if (lifetimePoints >= 10000) return { tier: 'PLATINUM', progress: 100 };
    if (lifetimePoints >= 5000) return { tier: 'GOLD', progress: Math.round(((lifetimePoints - 5000) / 5000) * 100) };
    if (lifetimePoints >= 1000) return { tier: 'SILVER', progress: Math.round(((lifetimePoints - 1000) / 4000) * 100) };
    return { tier: 'BRONZE', progress: Math.round((lifetimePoints / 1000) * 100) };
  }

  async getOrCreateUser(userId: string): Promise<LoyaltyUser> {
    const ts = new Date().toISOString();
    const { tier, progress } = this.calculateTier(WELCOME_BONUS_POINTS);

    return this.repo.ensureUser(userId, {
      userId,
      points: WELCOME_BONUS_POINTS,
      tier,
      tierProgress: progress,
      lifetimePoints: WELCOME_BONUS_POINTS,
      updatedAt: ts,
    });
  }

  async awardPoints(
    userId: string,
    points: number,
    source: 'PURCHASE' | 'REVIEW' | 'REFERRAL' | 'BIRTHDAY',
    description: string,
    referenceId?: string,
  ): Promise<LoyaltyUser> {
    const existing = await this.getOrCreateUser(userId);

    // The tier is derived from the balance this award will produce. Computed
    // here rather than inside the repository so the rule stays in one place.
    const { tier, progress } = this.calculateTier(existing.lifetimePoints + points);
    const ts = new Date().toISOString();

    const user = await this.repo.addPoints(userId, points, tier, progress, ts);
    if (!user) throw new Error(`Loyalty member ${userId} not found`);

    await this.repo.createTransaction({
      id: randomUUID(),
      userId,
      points,
      type: 'EARNED',
      source,
      referenceId,
      description,
      createdAt: ts,
    });

    void publish('loyalty-events' as never, {
      type: 'loyalty.points_earned',
      data: { userId, points, newBalance: user.points, tier: user.tier },
    });

    return user;
  }

  async getHistory(userId: string): Promise<LoyaltyTransaction[]> {
    return this.repo.findTransactions(userId);
  }

  async getAvailableRewards(): Promise<LoyaltyReward[]> {
    return this.repo.findActiveRewards();
  }

  async redeemReward(userId: string, rewardId: string): Promise<LoyaltyRedemption> {
    const user = await this.getOrCreateUser(userId);
    const reward = await this.repo.findReward(rewardId);
    if (!reward) throw new Error('Reward not found');

    const ts = new Date().toISOString();

    // Conditional deduction: null means the balance no longer covered the
    // cost. The old code checked the balance and then subtracted from it,
    // so two redemptions arriving together could both pass the check and
    // spend the same points.
    const debited = await this.repo.spendPoints(userId, reward.pointsCost, ts);
    if (!debited) {
      throw new Error(
        `Insufficient points balance (${user.points} available, ${reward.pointsCost} required)`,
      );
    }

    const redemption = await this.repo.createRedemption({
      id: randomUUID(),
      userId,
      rewardId,
      rewardName: reward.name,
      pointsSpent: reward.pointsCost,
      code: `REWARD-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      status: 'COMPLETED',
      redeemedAt: ts,
    });

    // Recorded on the ledger too — the old code debited the balance without
    // writing a REDEEMED transaction, so getHistory() showed points earned
    // and never showed them being spent.
    await this.repo.createTransaction({
      id: randomUUID(),
      userId,
      points: -reward.pointsCost,
      type: 'REDEEMED',
      source: 'PURCHASE',
      referenceId: redemption.id,
      description: `Redeemed ${reward.name}`,
      createdAt: ts,
    });

    void publish('loyalty-events' as never, {
      type: 'loyalty.reward_redeemed',
      data: redemption,
    });

    return redemption;
  }

  async getRedemptions(userId: string): Promise<LoyaltyRedemption[]> {
    return this.repo.findRedemptions(userId);
  }

  async generateReferral(referrerId: string): Promise<LoyaltyReferral> {
    const code = `REF-${referrerId.slice(-4).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

    return this.repo.createReferral({
      id: randomUUID(),
      referrerId,
      referralCode: code,
      status: 'PENDING',
      rewardPoints: 100,
      createdAt: new Date().toISOString(),
    });
  }

  async findReferral(code: string): Promise<LoyaltyReferral | null> {
    return this.repo.findReferralByCode(code);
  }

  async claimBirthdayBonus(userId: string): Promise<LoyaltyUser> {
    return this.awardPoints(userId, 50, 'BIRTHDAY', 'Annual Birthday Reward Bonus');
  }
}

export const loyaltyService = new LoyaltyService();
