import type { CompetitorPrice, PriceHistory, PricingRule } from '../models/pricing.model.js';
import type { IPricingRepository } from '../types/repositories.js';

// ─── In-memory pricing repository ─────────────────────────────────────────────
//
// For tests, and for running without a database. Starts with no competitor
// prices: the seeded Jumia and Kikuubo figures were invented, and auto-pricing
// reads competitor rows to set real prices.

export class MemoryPricingRepository implements IPricingRepository {
  private readonly rules = new Map<string, PricingRule>();
  private readonly competitors = new Map<string, CompetitorPrice[]>();
  private readonly history = new Map<string, PriceHistory[]>();

  clear(): void {
    this.rules.clear();
    this.competitors.clear();
    this.history.clear();
  }

  async createRule(rule: PricingRule): Promise<PricingRule> {
    this.rules.set(rule.id, structuredClone(rule));
    return structuredClone(rule);
  }

  async findRulesBySeller(sellerId: string): Promise<PricingRule[]> {
    return [...this.rules.values()]
      .filter((r) => r.sellerId === sellerId)
      .map((r) => structuredClone(r));
  }

  async findActiveRules(): Promise<PricingRule[]> {
    return [...this.rules.values()].filter((r) => r.isActive).map((r) => structuredClone(r));
  }

  async updateRulePrice(
    id: string,
    currentPrice: number,
    updatedAt: string,
  ): Promise<PricingRule | null> {
    const rule = this.rules.get(id);
    if (!rule) return null;

    rule.currentPrice = currentPrice;
    rule.updatedAt = updatedAt;

    return structuredClone(rule);
  }

  async findCompetitorPrices(productId: string): Promise<CompetitorPrice[]> {
    return (this.competitors.get(productId) ?? []).map((c) => structuredClone(c));
  }

  async recordCompetitorPrice(price: CompetitorPrice): Promise<CompetitorPrice> {
    const list = this.competitors.get(price.productId) ?? [];
    list.push(structuredClone(price));
    this.competitors.set(price.productId, list);
    return structuredClone(price);
  }

  async recordPriceHistory(history: PriceHistory): Promise<PriceHistory> {
    const list = this.history.get(history.productId) ?? [];
    list.push(structuredClone(history));
    this.history.set(history.productId, list);
    return structuredClone(history);
  }

  async findPriceHistory(productId: string): Promise<PriceHistory[]> {
    return (this.history.get(productId) ?? []).map((h) => structuredClone(h));
  }
}
