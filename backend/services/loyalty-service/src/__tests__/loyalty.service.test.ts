import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.unstable_mockModule('../../../../shared/kafka/producer.js', () => ({
  publish: jest.fn<() => Promise<void>>().mockResolvedValue(),
  connectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  disconnectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  isProducerReady: jest.fn<() => boolean>().mockReturnValue(true),
}));

const { MemoryLoyaltyRepository } = await import('../repositories/memory-loyalty.repository.js');
const { LoyaltyService } = await import('../services/loyalty.service.js');

const USER = 'user-123';

let repo: InstanceType<typeof MemoryLoyaltyRepository>;
let service: InstanceType<typeof LoyaltyService>;

beforeEach(() => {
  repo = new MemoryLoyaltyRepository();
  service = new LoyaltyService(repo);
});

describe('LoyaltyService against a repository', () => {
  it('creates a member with the welcome bonus and persists them', async () => {
    const user = await service.getOrCreateUser(USER);

    expect(user.points).toBe(250);
    expect(user.tier).toBe('BRONZE');
    expect(await repo.findUser(USER)).not.toBeNull();
  });

  it('returns the same member on a second call rather than re-granting the bonus', async () => {
    await service.getOrCreateUser(USER);
    await service.awardPoints(USER, 100, 'PURCHASE', 'Order MUNI-1');

    const again = await service.getOrCreateUser(USER);
    expect(again.points).toBe(350);
  });

  it('awards points and writes a ledger entry', async () => {
    const user = await service.awardPoints(USER, 500, 'PURCHASE', 'Order MUNI-1', 'MUNI-1');

    expect(user.points).toBe(750);
    expect(user.lifetimePoints).toBe(750);

    const history = await service.getHistory(USER);
    expect(history).toHaveLength(1);
    expect(history[0]!.type).toBe('EARNED');
    expect(history[0]!.referenceId).toBe('MUNI-1');
  });

  it('persists the new balance, not just the returned object', async () => {
    await service.awardPoints(USER, 500, 'PURCHASE', 'Order MUNI-1');
    expect((await repo.findUser(USER))!.points).toBe(750);
  });

  describe('tiers', () => {
    it.each([
      [0, 'BRONZE'],
      [800, 'SILVER'],
      [4800, 'GOLD'],
      [9800, 'PLATINUM'],
    ])('reaches %s extra points → %s', async (extra, tier) => {
      await service.awardPoints(USER, extra, 'PURCHASE', 'top-up');
      expect((await repo.findUser(USER))!.tier).toBe(tier);
    });
  });

  describe('redemption', () => {
    it('lists the seeded reward catalogue', async () => {
      const rewards = await service.getAvailableRewards();
      expect(rewards.map((r) => r.id)).toEqual(['rw-1', 'rw-2']);
    });

    it('redeems a reward, debits the balance and issues a code', async () => {
      await service.awardPoints(USER, 500, 'PURCHASE', 'Order MUNI-1'); // 750 total

      const redemption = await service.redeemReward(USER, 'rw-1');

      expect(redemption.pointsSpent).toBe(500);
      expect(redemption.code).toMatch(/^REWARD-/);
      expect((await repo.findUser(USER))!.points).toBe(250);
    });

    it('records the spend on the ledger so it reconciles with the balance', async () => {
      await service.awardPoints(USER, 500, 'PURCHASE', 'Order MUNI-1');
      await service.redeemReward(USER, 'rw-1');

      const history = await service.getHistory(USER);
      const net = history.reduce((sum, t) => sum + t.points, 0);

      // 250 welcome + 500 earned - 500 redeemed. The welcome bonus is granted
      // at creation without a ledger row, so the ledger nets to the balance
      // minus that bonus.
      expect(net).toBe(0);
      expect((await repo.findUser(USER))!.points).toBe(250);
      expect(history.some((t) => t.type === 'REDEEMED')).toBe(true);
    });

    it('refuses a redemption the balance cannot cover', async () => {
      await expect(service.redeemReward(USER, 'rw-2')).rejects.toThrow(/Insufficient points/);
    });

    it('leaves the balance untouched when a redemption is refused', async () => {
      await service.getOrCreateUser(USER);
      await expect(service.redeemReward(USER, 'rw-2')).rejects.toThrow();
      expect((await repo.findUser(USER))!.points).toBe(250);
    });

    it('cannot spend the same points twice', async () => {
      await service.awardPoints(USER, 500, 'PURCHASE', 'Order MUNI-1'); // 750

      await service.redeemReward(USER, 'rw-1'); // -500 → 250
      // Second attempt must fail on the conditional deduction rather than
      // driving the balance negative.
      await expect(service.redeemReward(USER, 'rw-1')).rejects.toThrow(/Insufficient points/);
      expect((await repo.findUser(USER))!.points).toBe(250);
    });

    it('rejects an unknown reward', async () => {
      await expect(service.redeemReward(USER, 'nope')).rejects.toThrow('Reward not found');
    });
  });

  describe('referrals and bonuses', () => {
    it('generates a referral that can be looked up by its code', async () => {
      const referral = await service.generateReferral(USER);

      expect(referral.referralCode).toMatch(/^REF-/);
      expect(referral.status).toBe('PENDING');
      expect(await service.findReferral(referral.referralCode)).not.toBeNull();
    });

    it('grants the birthday bonus through the normal award path', async () => {
      const user = await service.claimBirthdayBonus(USER);

      expect(user.points).toBe(300);
      const history = await service.getHistory(USER);
      expect(history[0]!.source).toBe('BIRTHDAY');
    });
  });
});
