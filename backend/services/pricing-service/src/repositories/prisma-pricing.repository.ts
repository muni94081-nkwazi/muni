import { Prisma } from '../generated/prisma/index.js';
import { prisma } from '../db/prisma.js';
import type { CompetitorPrice, PriceHistory, PricingRule } from '../models/pricing.model.js';
import type { IPricingRepository } from '../types/repositories.js';

// ─── Prisma-backed pricing repository ─────────────────────────────────────────

type RuleRow = Prisma.PricingRuleGetPayload<Record<string, never>>;
type CompetitorRow = Prisma.CompetitorPriceGetPayload<Record<string, never>>;
type HistoryRow = Prisma.PriceHistoryGetPayload<Record<string, never>>;

const ruleToDomain = (row: RuleRow): PricingRule => ({
  id: row.id,
  sellerId: row.sellerId,
  productId: row.productId,
  ruleType: row.ruleType,
  targetPrice: row.targetPrice.toNumber(),
  minPriceFloor: row.minPriceFloor.toNumber(),
  currentPrice: row.currentPrice.toNumber(),
  isActive: row.isActive,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const competitorToDomain = (row: CompetitorRow): CompetitorPrice => ({
  id: row.id,
  productId: row.productId,
  competitorName: row.competitorName,
  price: row.price.toNumber(),
  currency: row.currency,
  scrapedAt: row.scrapedAt,
});

const historyToDomain = (row: HistoryRow): PriceHistory => ({
  id: row.id,
  productId: row.productId,
  oldPrice: row.oldPrice.toNumber(),
  newPrice: row.newPrice.toNumber(),
  reason: row.reason,
  changedAt: row.changedAt,
});

export class PrismaPricingRepository implements IPricingRepository {
  async createRule(rule: PricingRule): Promise<PricingRule> {
    const row = await prisma.pricingRule.create({
      data: {
        id: rule.id,
        sellerId: rule.sellerId,
        productId: rule.productId,
        ruleType: rule.ruleType,
        targetPrice: rule.targetPrice,
        minPriceFloor: rule.minPriceFloor,
        currentPrice: rule.currentPrice,
        isActive: rule.isActive,
        createdAt: new Date(rule.createdAt),
        updatedAt: new Date(rule.updatedAt),
      },
    });
    return ruleToDomain(row);
  }

  async findRulesBySeller(sellerId: string): Promise<PricingRule[]> {
    const rows = await prisma.pricingRule.findMany({
      where: { sellerId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(ruleToDomain);
  }

  async findActiveRules(): Promise<PricingRule[]> {
    const rows = await prisma.pricingRule.findMany({ where: { isActive: true } });
    return rows.map(ruleToDomain);
  }

  async updateRulePrice(
    id: string,
    currentPrice: number,
    updatedAt: string,
  ): Promise<PricingRule | null> {
    try {
      const row = await prisma.pricingRule.update({
        where: { id },
        data: { currentPrice, updatedAt: new Date(updatedAt) },
      });
      return ruleToDomain(row);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') return null;
      throw err;
    }
  }

  async findCompetitorPrices(productId: string): Promise<CompetitorPrice[]> {
    const rows = await prisma.competitorPrice.findMany({
      where: { productId },
      orderBy: { scrapedAt: 'desc' },
    });
    return rows.map(competitorToDomain);
  }

  async recordCompetitorPrice(price: CompetitorPrice): Promise<CompetitorPrice> {
    const row = await prisma.competitorPrice.create({
      data: {
        id: price.id,
        productId: price.productId,
        competitorName: price.competitorName,
        price: price.price,
        currency: price.currency,
        scrapedAt: price.scrapedAt,
      },
    });
    return competitorToDomain(row);
  }

  async recordPriceHistory(history: PriceHistory): Promise<PriceHistory> {
    const row = await prisma.priceHistory.create({
      data: {
        id: history.id,
        productId: history.productId,
        oldPrice: history.oldPrice,
        newPrice: history.newPrice,
        reason: history.reason,
        changedAt: history.changedAt,
      },
    });
    return historyToDomain(row);
  }

  async findPriceHistory(productId: string): Promise<PriceHistory[]> {
    const rows = await prisma.priceHistory.findMany({
      where: { productId },
      orderBy: { changedAt: 'asc' },
    });
    return rows.map(historyToDomain);
  }
}

export const prismaPricingRepository = new PrismaPricingRepository();
