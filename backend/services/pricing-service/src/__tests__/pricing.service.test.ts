import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.unstable_mockModule('../../../../shared/kafka/producer.js', () => ({
  publish: jest.fn<() => Promise<void>>().mockResolvedValue(),
  connectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  disconnectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  isProducerReady: jest.fn<() => boolean>().mockReturnValue(true),
}));

const { MemoryPricingRepository } = await import('../repositories/memory-pricing.repository.js');
const { PricingService } = await import('../services/pricing.service.js');

let repo: InstanceType<typeof MemoryPricingRepository>;
let service: InstanceType<typeof PricingService>;

beforeEach(() => {
  repo = new MemoryPricingRepository();
  service = new PricingService(repo);
});

describe('PricingService against a repository', () => {
  it('creates a rule and reads it back for the seller', async () => {
    const rule = await service.createRule('seller-1', 'p1', 'MATCH', 4_000_000, 3_500_000, 4_200_000);

    expect(rule.isActive).toBe(true);
    expect(await service.getRules('seller-1')).toHaveLength(1);
    expect(await service.getRules('seller-2')).toHaveLength(0);
  });

  it('starts with no competitor prices rather than invented ones', async () => {
    expect(await service.getCompetitorPrices('phone-001')).toEqual([]);
  });

  it('records an observed competitor price', async () => {
    await service.recordCompetitorPrice('p1', 'Jumia Uganda', 4_150_000);
    expect(await service.getCompetitorPrices('p1')).toHaveLength(1);
  });

  describe('auto-pricing', () => {
    async function ruleWithCompetitors(
      ruleType: 'MATCH' | 'BEAT_BY' | 'PERCENTAGE',
      floor: number,
      current = 4_200_000,
    ) {
      const rule = await service.createRule('seller-1', 'p1', ruleType, 4_000_000, floor, current);
      await service.recordCompetitorPrice('p1', 'Jumia', 4_150_000);
      await service.recordCompetitorPrice('p1', 'Kikuubo', 4_100_000);
      return rule;
    }

    it('MATCH drops to the cheapest competitor', async () => {
      const rule = await ruleWithCompetitors('MATCH', 3_000_000);

      const changes = await service.applyAutoPricingRules();

      expect(changes).toHaveLength(1);
      expect(changes[0]!.newPrice).toBe(4_100_000);
      expect((await service.getRules('seller-1'))[0]!.currentPrice).toBe(4_100_000);
      void rule;
    });

    it('BEAT_BY undercuts the cheapest competitor', async () => {
      await ruleWithCompetitors('BEAT_BY', 3_000_000);

      const changes = await service.applyAutoPricingRules();
      expect(changes[0]!.newPrice).toBe(4_090_000);
    });

    it('PERCENTAGE prices below the cheapest competitor', async () => {
      await ruleWithCompetitors('PERCENTAGE', 3_000_000);

      const changes = await service.applyAutoPricingRules();
      expect(changes[0]!.newPrice).toBe(Math.round(4_100_000 * 0.98));
    });

    it('never prices below the floor', async () => {
      // The floor is the seller's guarantee that automation cannot price them
      // below cost, so it wins over any competitor-derived figure.
      await ruleWithCompetitors('BEAT_BY', 4_150_000);

      const changes = await service.applyAutoPricingRules();
      expect(changes[0]!.newPrice).toBe(4_150_000);
    });

    it('does nothing when there are no competitor prices', async () => {
      await service.createRule('seller-1', 'lonely', 'MATCH', 1, 1, 100);
      expect(await service.applyAutoPricingRules()).toEqual([]);
    });

    it('does nothing on a second run once the price already matches', async () => {
      await ruleWithCompetitors('MATCH', 3_000_000);

      expect(await service.applyAutoPricingRules()).toHaveLength(1);
      expect(await service.applyAutoPricingRules()).toHaveLength(0);
    });

    it('writes an audit trail of every change', async () => {
      await ruleWithCompetitors('MATCH', 3_000_000);
      await service.applyAutoPricingRules();

      const history = await service.getPriceHistory('p1');
      expect(history).toHaveLength(1);
      expect(history[0]!.oldPrice).toBe(4_200_000);
      expect(history[0]!.newPrice).toBe(4_100_000);
      expect(history[0]!.reason).toContain('MATCH');
    });
  });
});
