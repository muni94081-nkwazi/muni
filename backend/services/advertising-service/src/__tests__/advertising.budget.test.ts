import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.unstable_mockModule('../../../../shared/kafka/producer.js', () => ({
  publish: jest.fn<() => Promise<void>>().mockResolvedValue(),
  connectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  disconnectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  isProducerReady: jest.fn<() => boolean>().mockReturnValue(true),
}));

const { MemoryAdvertisingRepository } = await import('../repositories/memory-advertising.repository.js');
const { AdvertisingService } = await import('../services/advertising.service.js');

let repo: InstanceType<typeof MemoryAdvertisingRepository>;
let service: InstanceType<typeof AdvertisingService>;

beforeEach(() => {
  repo = new MemoryAdvertisingRepository();
  service = new AdvertisingService(repo);
});

const campaignInput = (over: Record<string, unknown> = {}) => ({
  sellerId: 'seller-1',
  productId: 'p1',
  productName: 'Galaxy S24',
  campaignName: 'Search Ads',
  dailyBudgetUGX: 1000,
  bidPerClickUGX: 500,
  keywords: ['Phone', ' Samsung '],
  ...over,
});

describe('AdvertisingService budget enforcement', () => {
  it('normalises keywords on write so matching is a plain comparison', async () => {
    const campaign = await service.createCampaign(campaignInput());
    expect(campaign.keywords).toEqual(['phone', 'samsung']);
  });

  it('charges the bid per click and persists the spend', async () => {
    const campaign = await service.createCampaign(campaignInput());

    const click = await service.recordClick(campaign.id, '127.0.0.1');

    expect(click!.chargedAmountUGX).toBe(500);
    expect((await service.getCampaignById(campaign.id))!.totalSpentUGX).toBe(500);
  });

  it('stops charging once the daily budget is spent', async () => {
    const campaign = await service.createCampaign(campaignInput());

    expect(await service.recordClick(campaign.id)).not.toBeNull();
    expect(await service.recordClick(campaign.id)).not.toBeNull();
    // 2 x 500 = the whole 1000 budget.
    expect(await service.recordClick(campaign.id)).toBeNull();
  });

  it('never bills past the daily budget', async () => {
    // The heart of the change: the old code read the spend, checked it against
    // the budget, then incremented — so clicks arriving together could both
    // pass and overspend the seller.
    const campaign = await service.createCampaign(campaignInput({ dailyBudgetUGX: 1200 }));

    for (let i = 0; i < 10; i++) await service.recordClick(campaign.id);

    const after = await service.getCampaignById(campaign.id);
    expect(after!.totalSpentUGX).toBeLessThanOrEqual(1200);
    expect(after!.status).toBe('BUDGET_EXHAUSTED');
  });

  it('writes a click row for every charge', async () => {
    const campaign = await service.createCampaign(campaignInput());
    await service.recordClick(campaign.id);
    await service.recordClick(campaign.id);

    const clicks = await service.getClicks(campaign.id);
    expect(clicks).toHaveLength(2);
    expect(clicks.every((c) => c.chargedAmountUGX === 500)).toBe(true);
  });

  it('returns null for a campaign that does not exist', async () => {
    expect(await service.recordClick('nope')).toBeNull();
  });

  it('excludes exhausted campaigns from sponsored results', async () => {
    const campaign = await service.createCampaign(campaignInput());
    await service.recordClick(campaign.id);
    await service.recordClick(campaign.id);

    expect(await service.getSponsoredProducts('phone')).toHaveLength(0);
  });

  it('counts an impression for every servable campaign, matched or not', async () => {
    const campaign = await service.createCampaign(campaignInput({ dailyBudgetUGX: 100000 }));

    await service.getSponsoredProducts('something-unrelated');

    expect((await service.getCampaignById(campaign.id))!.totalImpressions).toBe(1);
  });

  it('ranks a keyword match above an unmatched impression', async () => {
    await service.createCampaign(campaignInput({ dailyBudgetUGX: 100000, bidPerClickUGX: 400, keywords: ['phone'] }));
    await service.createCampaign(campaignInput({ dailyBudgetUGX: 100000, bidPerClickUGX: 300, keywords: ['phone'] }));

    const results = await service.getSponsoredProducts('phone');
    expect(results).toHaveLength(2);
    expect(results[0]!.matchScore).toBeGreaterThan(results[1]!.matchScore);
  });

  it('computes CTR and CPC from the persisted counters', async () => {
    const campaign = await service.createCampaign(campaignInput({ dailyBudgetUGX: 100000 }));
    await service.getSponsoredProducts('phone');
    await service.recordClick(campaign.id);

    const analytics = await service.getAnalytics('seller-1');
    expect(analytics.totalCampaigns).toBe(1);
    expect(analytics.totalClicks).toBe(1);
    expect(analytics.totalSpendUGX).toBe(500);
    expect(analytics.averageCPCUGX).toBe(500);
    expect(analytics.averageCTRPercent).toBe(100);
  });
});
