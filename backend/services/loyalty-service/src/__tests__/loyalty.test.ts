import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockPublish = jest.fn<() => Promise<void>>().mockResolvedValue();

jest.unstable_mockModule('../../../../shared/kafka/producer.js', () => ({
  publish: mockPublish,
  connectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  disconnectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  isProducerReady: jest.fn<() => boolean>().mockReturnValue(true),
}));

const { LoyaltyService } = await import('../services/loyalty.service.js');
const { MemoryLoyaltyRepository } = await import('../repositories/memory-loyalty.repository.js');

// One instance for the whole suite: these tests deliberately chain, each
// building on the balance the previous one left behind. The module singleton
// is Prisma-backed now, so the memory repository stands in for it here.
const loyaltyService = new LoyaltyService(new MemoryLoyaltyRepository());

describe('Phase 19 — Loyalty Program Service Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('initializes user with welcome bonus points', async () => {
    const user = await loyaltyService.getOrCreateUser('user-test-1');
    expect(user.userId).toBe('user-test-1');
    expect(user.points).toBe(250);
    expect(user.tier).toBe('BRONZE');
  });

  it('awards points and promotes tier upon reaching thresholds', async () => {
    const user = await loyaltyService.awardPoints('user-test-1', 4800, 'PURCHASE', 'Order #MUNI-1001');
    expect(user.points).toBe(5050);
    expect(user.tier).toBe('GOLD');
  });

  it('redeems available rewards and deducts points', async () => {
    const redemption = await loyaltyService.redeemReward('user-test-1', 'rw-1');
    expect(redemption.code).toBeDefined();
    expect(redemption.pointsSpent).toBe(500);

    const user = await loyaltyService.getOrCreateUser('user-test-1');
    expect(user.points).toBe(4550);
  });

  it('generates unique referral link codes', async () => {
    const ref = await loyaltyService.generateReferral('user-test-1');
    expect(ref.referralCode).toContain('REF-');
    expect(ref.rewardPoints).toBe(100);
  });

  it('claims annual birthday bonus points', async () => {
    const user = await loyaltyService.claimBirthdayBonus('user-test-1');
    expect(user.points).toBe(4600);
  });
});
