import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockPublish = jest.fn<() => Promise<void>>().mockResolvedValue();

jest.unstable_mockModule('../../../../shared/kafka/producer.js', () => ({
  publish: mockPublish,
  connectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  disconnectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  isProducerReady: jest.fn<() => boolean>().mockReturnValue(true),
}));

const { PricingService } = await import('../services/pricing.service.js');
const { MemoryPricingRepository } = await import('../repositories/memory-pricing.repository.js');

// One instance for the whole suite: these tests chain, the rule created in the
// first being the one auto-pricing acts on later. The competitor prices were
// hardcoded into the service's Map; they are seeded here now, because invented
// Jumia and Kikuubo figures in a real database would drive real price changes.
const repo = new MemoryPricingRepository();
const pricingService = new PricingService(repo);

await pricingService.recordCompetitorPrice('phone-001', 'Jumia Uganda', 4150000);
await pricingService.recordCompetitorPrice('phone-001', 'Kikuubo Online', 4100000);

describe('Phase 19 — Dynamic Pricing Engine Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates an automated re-pricing rule for a product', async () => {
    const rule = await pricingService.createRule(
      'seller-001',
      'phone-001',
      'BEAT_BY',
      4000000,
      3900000,
      4200000
    );

    expect(rule.id).toBeDefined();
    expect(rule.ruleType).toBe('BEAT_BY');
    expect(rule.minPriceFloor).toBe(3900000);
  });

  it('retrieves scraped competitor prices for a product', async () => {
    const competitors = await pricingService.getCompetitorPrices('phone-001');
    expect(competitors.length).toBeGreaterThan(0);
    expect(competitors[0].price).toBe(4150000);
  });

  it('executes auto-pricing calculation while respecting min price floor', async () => {
    const histories = await pricingService.applyAutoPricingRules();
    expect(histories.length).toBeGreaterThan(0);
    expect(histories[0].newPrice).toBe(4090000); // 4,100,000 - 10,000
  });

  it('audits price change history with timestamps and reasons', async () => {
    const history = await pricingService.getPriceHistory('phone-001');
    expect(history.length).toBeGreaterThan(0);
    expect(history[0].reason).toContain('BEAT_BY');
  });
});
