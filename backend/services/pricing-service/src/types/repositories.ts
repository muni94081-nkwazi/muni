import type { CompetitorPrice, PriceHistory, PricingRule } from '../models/pricing.model.js';

// ─── Repository contract ──────────────────────────────────────────────────────

export interface IPricingRepository {
  createRule(rule: PricingRule): Promise<PricingRule>;
  findRulesBySeller(sellerId: string): Promise<PricingRule[]>;
  /** Every rule the auto-pricing sweep should consider. */
  findActiveRules(): Promise<PricingRule[]>;
  updateRulePrice(id: string, currentPrice: number, updatedAt: string): Promise<PricingRule | null>;

  findCompetitorPrices(productId: string): Promise<CompetitorPrice[]>;
  recordCompetitorPrice(price: CompetitorPrice): Promise<CompetitorPrice>;

  recordPriceHistory(history: PriceHistory): Promise<PriceHistory>;
  findPriceHistory(productId: string): Promise<PriceHistory[]>;
}
