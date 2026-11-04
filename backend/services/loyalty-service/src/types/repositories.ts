import type {
  LoyaltyRedemption,
  LoyaltyReferral,
  LoyaltyReward,
  LoyaltyTransaction,
  LoyaltyUser,
} from '../models/loyalty.model.js';

// ─── Repository contract ──────────────────────────────────────────────────────
//
// One contract for the whole service: the five Maps it replaces were all read
// and written by LoyaltyService alone, and splitting them into five interfaces
// would add ceremony without adding a seam anyone needs.

export interface ILoyaltyRepository {
  /** Fetch the member, creating them with the welcome bonus if new. */
  ensureUser(userId: string, welcome: LoyaltyUser): Promise<LoyaltyUser>;

  findUser(userId: string): Promise<LoyaltyUser | null>;

  /**
   * Add points to a balance and recompute the tier, atomically.
   *
   * Takes the delta rather than the new total: awardPoints() used to read the
   * balance, add to it in JavaScript and write it back, so two concurrent
   * awards would both read the same starting balance and one would be lost.
   */
  addPoints(
    userId: string,
    delta: number,
    tier: LoyaltyUser['tier'],
    tierProgress: number,
    updatedAt: string,
  ): Promise<LoyaltyUser | null>;

  /**
   * Deduct points only if the balance still covers the cost.
   *
   * Returns null when it does not, which the service turns into the same
   * "insufficient points" error. Conditional for the same reason as above —
   * a read-check-write would let two redemptions spend the same points.
   */
  spendPoints(userId: string, cost: number, updatedAt: string): Promise<LoyaltyUser | null>;

  createTransaction(tx: LoyaltyTransaction): Promise<LoyaltyTransaction>;

  findTransactions(userId: string): Promise<LoyaltyTransaction[]>;

  findActiveRewards(): Promise<LoyaltyReward[]>;

  findReward(rewardId: string): Promise<LoyaltyReward | null>;

  createRedemption(redemption: LoyaltyRedemption): Promise<LoyaltyRedemption>;

  findRedemptions(userId: string): Promise<LoyaltyRedemption[]>;

  createReferral(referral: LoyaltyReferral): Promise<LoyaltyReferral>;

  findReferralByCode(code: string): Promise<LoyaltyReferral | null>;
}
