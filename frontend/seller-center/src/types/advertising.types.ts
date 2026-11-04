export type MatchType = 'exact' | 'phrase' | 'broad';

export type CampaignStatus = 'active' | 'paused' | 'ended' | 'draft';

export interface Keyword {
  id: string;
  text: string;
  matchType: MatchType;
  bid: number;
  impressions: number;
  clicks: number;
  spend: number;
  sales: number;
}

export interface AdGroup {
  id: string;
  name: string;
  productIds: string[];
  keywords: Keyword[];
}

export interface CampaignMetrics {
  impressions: number;
  clicks: number;
  spend: number;
  sales: number;
  acos: number;
  roas: number;
  ctr: number;
}

export interface Campaign {
  id: string;
  name: string;
  status: CampaignStatus;
  dailyBudget: number;
  startDate: string;
  endDate?: string;
  adGroups: AdGroup[];
  metrics: CampaignMetrics;
  history: { date: string; spend: number; sales: number; acos: number }[];
}
