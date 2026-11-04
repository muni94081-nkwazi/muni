import { randomUUID } from 'node:crypto';
import type { PricingRule, CompetitorPrice, PriceHistory } from '../models/pricing.model.js';
import { publish } from '../../../../shared/kafka/producer.js';
import { prismaPricingRepository } from '../repositories/prisma-pricing.repository.js';
import type { IPricingRepository } from '../types/repositories.js';

// ─── Pricing service ──────────────────────────────────────────────────────────
//
// Rules, competitor prices and history live in Postgres behind
// IPricingRepository. A repricing rule is a standing instruction to change
// what a seller charges, with a floor it must never cross; losing the rules on
// restart silently stopped repricing, and losing the history destroyed the
// audit trail for why a price moved.
//
// The seeded `phone-001` competitor prices are gone — invented Jumia and
// Kikuubo figures that auto-pricing would have used to set real prices.

/** Flat amount a BEAT_BY rule undercuts the cheapest competitor by. */
const BEAT_BY_MARGIN_UGX = 10_000;
/** A PERCENTAGE rule prices this far below the cheapest competitor. */
const PERCENTAGE_OF_COMPETITOR = 0.98;

export class PricingService {
  constructor(private readonly repo: IPricingRepository = prismaPricingRepository) {}

  async createRule(
    sellerId: string,
    productId: string,
    ruleType: 'MATCH' | 'BEAT_BY' | 'PERCENTAGE',
    targetPrice: number,
    minPriceFloor: number,
    currentPrice: number,
  ): Promise<PricingRule> {
    const ts = new Date().toISOString();

    return this.repo.createRule({
      id: randomUUID(),
      sellerId,
      productId,
      ruleType,
      targetPrice,
      minPriceFloor,
      currentPrice,
      isActive: true,
      createdAt: ts,
      updatedAt: ts,
    });
  }

  async getRules(sellerId: string): Promise<PricingRule[]> {
    return this.repo.findRulesBySeller(sellerId);
  }

  async getCompetitorPrices(productId: string): Promise<CompetitorPrice[]> {
    return this.repo.findCompetitorPrices(productId);
  }

  /** Record an observed competitor price for a product. */
  async recordCompetitorPrice(
    productId: string,
    competitorName: string,
    price: number,
    currency = 'UGX',
  ): Promise<CompetitorPrice> {
    return this.repo.recordCompetitorPrice({
      id: randomUUID(),
      productId,
      competitorName,
      price,
      currency,
      scrapedAt: new Date().toISOString(),
    });
  }

  async applyAutoPricingRules(): Promise<PriceHistory[]> {
    const histories: PriceHistory[] = [];
    const rules = await this.repo.findActiveRules();

    for (const rule of rules) {
      const competitors = await this.repo.findCompetitorPrices(rule.productId);
      if (competitors.length === 0) continue;

      const lowestCompetitorPrice = Math.min(...competitors.map((c) => c.price));
      let calculatedPrice = rule.currentPrice;

      if (rule.ruleType === 'MATCH') {
        calculatedPrice = lowestCompetitorPrice;
      } else if (rule.ruleType === 'BEAT_BY') {
        calculatedPrice = lowestCompetitorPrice - BEAT_BY_MARGIN_UGX;
      } else if (rule.ruleType === 'PERCENTAGE') {
        calculatedPrice = Math.round(lowestCompetitorPrice * PERCENTAGE_OF_COMPETITOR);
      }

      // The floor wins over any competitor-derived figure. This is the seller's
      // guarantee that automation cannot price them below cost.
      if (calculatedPrice < rule.minPriceFloor) {
        calculatedPrice = rule.minPriceFloor;
      }

      if (calculatedPrice === rule.currentPrice) continue;

      const oldPrice = rule.currentPrice;
      const ts = new Date().toISOString();

      await this.repo.updateRulePrice(rule.id, calculatedPrice, ts);

      const history = await this.repo.recordPriceHistory({
        id: randomUUID(),
        productId: rule.productId,
        oldPrice,
        newPrice: calculatedPrice,
        reason: `Auto-adjusted via ${rule.ruleType} rule (lowest competitor: ${lowestCompetitorPrice.toLocaleString()} UGX)`,
        changedAt: ts,
      });

      histories.push(history);

      void publish('pricing-events' as never, {
        type: 'pricing.price_changed',
        data: history,
      });
    }

    return histories;
  }

  async getPriceHistory(productId: string): Promise<PriceHistory[]> {
    return this.repo.findPriceHistory(productId);
  }
}

export const pricingService = new PricingService();
