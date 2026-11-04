export type LoyaltyTier = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';

export interface LoyaltyUser {
  userId: string;
  points: number;
  tier: LoyaltyTier;
  tierProgress: number;
  lifetimePoints: number;
  updatedAt: string;
}

export interface LoyaltyTransaction {
  id: string;
  userId: string;
  points: number;
  type: 'EARNED' | 'REDEEMED' | 'EXPIRED';
  source: 'PURCHASE' | 'REVIEW' | 'REFERRAL' | 'BIRTHDAY';
  referenceId?: string;
  description: string;
  createdAt: string;
}

export interface LoyaltyReward {
  id: string;
  name: string;
  description: string;
  pointsCost: number;
  type: 'DISCOUNT' | 'FREE_SHIPPING' | 'PRODUCT';
  value: number;
  isActive: boolean;
}

export interface LoyaltyRedemption {
  id: string;
  userId: string;
  rewardId: string;
  rewardName: string;
  pointsSpent: number;
  code: string;
  status: 'PENDING' | 'COMPLETED' | 'EXPIRED';
  redeemedAt: string;
}

export interface LoyaltyReferral {
  id: string;
  referrerId: string;
  refereeId?: string;
  referralCode: string;
  status: 'PENDING' | 'COMPLETED';
  rewardPoints: number;
  createdAt: string;
}
