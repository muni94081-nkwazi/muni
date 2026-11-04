export type RepricerStrategy = 'match_lowest' | 'beat_buybox' | 'fixed_margin';

export interface RepricerRule {
  id: string;
  name: string;
  productId: string;
  productName: string;
  strategy: RepricerStrategy;
  beatByAmount?: number;
  minPrice: number;
  maxPrice: number;
  currentPrice: number;
  isActive: boolean;
  lastAppliedAt?: string;
}

export interface PriceHistoryPoint {
  date: string;
  price: number;
  competitorPrice?: number;
}

export interface DiscountSchedule {
  id: string;
  productId: string;
  productName: string;
  discountPercent: number;
  startsAt: string;
  endsAt: string;
  isStrikeThrough: boolean;
}

export interface VolumeTier {
  id: string;
  productId: string;
  minQuantity: number;
  discountPercent: number;
}
