export type CampaignStatus = 'ACTIVE' | 'PAUSED' | 'EXPIRED' | 'BUDGET_EXHAUSTED';

export interface Campaign {
  id: string;
  sellerId: string;
  productId: string;
  productName: string;
  campaignName: string;
  dailyBudgetUGX: number;
  bidPerClickUGX: number;
  keywords: string[];
  status: CampaignStatus;
  totalImpressions: number;
  totalClicks: number;
  totalSpentUGX: number;
  startDate: string;
  endDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdClick {
  id: string;
  campaignId: string;
  productId: string;
  sellerId: string;
  chargedAmountUGX: number;
  userIp?: string;
  clickedAt: string;
}

export interface SponsoredProduct {
  campaignId: string;
  productId: string;
  productName: string;
  sellerId: string;
  bidPerClickUGX: number;
  isSponsoredBadge: boolean;
  matchScore: number;
}

export interface CampaignAnalytics {
  totalCampaigns: number;
  activeCampaigns: number;
  totalImpressions: number;
  totalClicks: number;
  averageCTRPercent: number; // Click-Through Rate
  totalSpendUGX: number;
  averageCPCUGX: number;     // Cost-Per-Click
}
