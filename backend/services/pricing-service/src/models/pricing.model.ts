export interface PricingRule {
  id: string;
  sellerId: string;
  productId: string;
  ruleType: 'MATCH' | 'BEAT_BY' | 'PERCENTAGE';
  targetPrice: number;
  minPriceFloor: number;
  currentPrice: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CompetitorPrice {
  id: string;
  productId: string;
  competitorName: string;
  price: number;
  currency: string;
  scrapedAt: string;
}

export interface PriceHistory {
  id: string;
  productId: string;
  oldPrice: number;
  newPrice: number;
  reason: string;
  changedAt: string;
}
