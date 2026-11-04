export type ReviewStatus = 'approved' | 'flagged' | 'rejected';
export type FlagReason = 'profanity' | 'spam' | 'suspicious_burst' | 'competitor_sabotage';

export interface SellerReply {
  replyBody: string;
  repliedAt: string;
}

export interface ProductReview {
  id: string;
  productId: string;
  sellerId?: string;
  userId: string;
  userName: string;
  rating: number; // 1-5
  title: string;
  body: string;
  verifiedPurchase: boolean;
  helpful: number;
  status: ReviewStatus;
  flagReason?: FlagReason | null;
  sellerReply?: SellerReply | null;
  userAccountCreatedAt?: string;
  userIp?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SellerReview {
  id: string;
  sellerId: string;
  userId: string;
  userName: string;
  communicationRating: number; // 1-5
  shippingSpeedRating: number; // 1-5
  itemAccuracyRating: number;   // 1-5
  overallRating: number;        // 1-5
  body: string;
  verifiedPurchase: boolean;
  status: ReviewStatus;
  flagReason?: FlagReason | null;
  sellerReply?: SellerReply | null;
  userAccountCreatedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type ReputationBadgeTier =
  | 'Top Rated Seller'
  | 'Trusted Seller'
  | 'Standard Seller'
  | 'Under Review';

export interface SellerReputation {
  sellerId: string;
  reputationScore: number;    // 0.0 to 5.0 scale
  reputationPercent: number;  // 0 to 100% scale
  badgeTier: ReputationBadgeTier;
  factors: {
    averageRating6Mo: number;       // 40% weight
    fulfillmentRate: number;        // 20% weight (0.0 to 1.0)
    responseTimeScore: number;      // 20% weight (0.0 to 1.0)
    lowDisputeReturnScore: number;  // 20% weight (0.0 to 1.0)
  };
  metrics: {
    averageRating: number;
    fulfillmentRatePercent: number;
    avgResponseTimeHours: number;
    disputeReturnRatePercent: number;
    totalReviewsCount: number;
  };
  searchRankMultiplier: number;     // e.g., 1.25 multiplier for Top Rated
  updatedAt: string;
}
