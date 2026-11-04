export interface ProtectionPolicy {
  policyVersion: string;
  protectionWindowDays: number; // e.g. 30 days
  maxCoverageLimitUGX: number;  // e.g. 10,000,000 UGX
  currency: string;
  coveredReasons: string[];
  excludedCategories: string[];
  termsAndConditionsUrl: string;
}

export interface EligibilityCheckRequest {
  orderId?: string;
  productId: string;
  category: string;
  orderAmountUGX: number;
  orderDeliveredAt?: string;
}

export interface EligibilityCheckResult {
  isEligible: boolean;
  productId: string;
  protectionWindowDays: number;
  maxCoverageAmountUGX: number;
  reason?: string;
}

export interface ProtectionClaim {
  id: string;
  claimNumber: string; // e.g. CLAIM-1001
  orderId: string;
  userId: string;
  productId: string;
  reason: 'ITEM_NOT_RECEIVED' | 'NOT_AS_DESCRIBED' | 'COUNTERFEIT' | 'DAMAGED';
  claimAmountUGX: number;
  status: 'FILED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED';
  adminNotes?: string;
  /** resolveClaim() wrote this through an `as any` cast; it belongs on the type. */
  resolutionNotes?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface ProtectionBadgeStatus {
  productId: string;
  hasProtectionBadge: boolean;
  guaranteeLabel: string;
  coverageLimitUGX: number;
  windowDays: number;
}
