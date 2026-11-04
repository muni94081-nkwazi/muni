import type {
  LoyaltyRedemption,
  LoyaltyReferral,
  LoyaltyReward,
  LoyaltyTransaction,
  LoyaltyUser,
} from '../models/loyalty.model.js';
import type { ILoyaltyRepository } from '../types/repositories.js';

// ─── In-memory loyalty repository ─────────────────────────────────────────────
//
// For tests, and for running without a database. Ships the same two starter
// rewards the migration seeds, so the two implementations answer
// findActiveRewards() identically on a fresh store.

const STARTER_REWARDS: LoyaltyReward[] = [
  {
    id: 'rw-1',
    name: '5,000 UGX Off Checkout Coupon',
    description: 'Redeem 500 points for 5,000 UGX instant discount',
    pointsCost: 500,
    type: 'DISCOUNT',
    value: 5000,
    isActive: true,
  },
  {
    id: 'rw-2',
    name: 'Free Standard Delivery (Nationwide)',
    description: 'Redeem 750 points for free shipping on any order',
    pointsCost: 750,
    type: 'FREE_SHIPPING',
    value: 15000,
    isActive: true,
  },
];

export class MemoryLoyaltyRepository implements ILoyaltyRepository {
  private readonly users = new Map<string, LoyaltyUser>();
  private readonly transactions: LoyaltyTransaction[] = [];
  private readonly rewards = new Map<string, LoyaltyReward>();
  private readonly redemptions: LoyaltyRedemption[] = [];
  private readonly referrals = new Map<string, LoyaltyReferral>();

  constructor(rewards: LoyaltyReward[] = STARTER_REWARDS) {
    for (const r of rewards) this.rewards.set(r.id, structuredClone(r));
  }

  clear(): void {
    this.users.clear();
    this.transactions.length = 0;
    this.redemptions.length = 0;
    this.referrals.clear();
  }

  async ensureUser(userId: string, welcome: LoyaltyUser): Promise<LoyaltyUser> {
    let user = this.users.get(userId);
    if (!user) {
      user = structuredClone(welcome);
      this.users.set(userId, user);
    }
    return structuredClone(user);
  }

  async findUser(userId: string): Promise<LoyaltyUser | null> {
    const found = this.users.get(userId);
    return found ? structuredClone(found) : null;
  }

  async addPoints(
    userId: string,
    delta: number,
    tier: LoyaltyUser['tier'],
    tierProgress: number,
    updatedAt: string,
  ): Promise<LoyaltyUser | null> {
    const user = this.users.get(userId);
    if (!user) return null;

    user.points += delta;
    user.lifetimePoints += delta;
    user.tier = tier;
    user.tierProgress = tierProgress;
    user.updatedAt = updatedAt;

    return structuredClone(user);
  }

  async spendPoints(userId: string, cost: number, updatedAt: string): Promise<LoyaltyUser | null> {
    const user = this.users.get(userId);
    // Null for both "no such member" and "cannot afford it", matching the
    // conditional UPDATE in the Prisma implementation.
    if (!user || user.points < cost) return null;

    user.points -= cost;
    user.updatedAt = updatedAt;

    return structuredClone(user);
  }

  async createTransaction(tx: LoyaltyTransaction): Promise<LoyaltyTransaction> {
    this.transactions.push(structuredClone(tx));
    return structuredClone(tx);
  }

  async findTransactions(userId: string): Promise<LoyaltyTransaction[]> {
    return this.transactions
      .filter((t) => t.userId === userId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((t) => structuredClone(t));
  }

  async findActiveRewards(): Promise<LoyaltyReward[]> {
    return [...this.rewards.values()]
      .filter((r) => r.isActive)
      .sort((a, b) => a.pointsCost - b.pointsCost)
      .map((r) => structuredClone(r));
  }

  async findReward(rewardId: string): Promise<LoyaltyReward | null> {
    const found = this.rewards.get(rewardId);
    return found ? structuredClone(found) : null;
  }

  async createRedemption(r: LoyaltyRedemption): Promise<LoyaltyRedemption> {
    this.redemptions.push(structuredClone(r));
    return structuredClone(r);
  }

  async findRedemptions(userId: string): Promise<LoyaltyRedemption[]> {
    return this.redemptions
      .filter((r) => r.userId === userId)
      .sort((a, b) => b.redeemedAt.localeCompare(a.redeemedAt))
      .map((r) => structuredClone(r));
  }

  async createReferral(r: LoyaltyReferral): Promise<LoyaltyReferral> {
    this.referrals.set(r.referralCode, structuredClone(r));
    return structuredClone(r);
  }

  async findReferralByCode(code: string): Promise<LoyaltyReferral | null> {
    const found = this.referrals.get(code);
    return found ? structuredClone(found) : null;
  }
}
