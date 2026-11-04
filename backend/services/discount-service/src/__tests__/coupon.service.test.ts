import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockPrismaClient = {
  coupon: {
    findUnique: jest.fn(),
    update: jest.fn()
  }
};

jest.unstable_mockModule('../prisma.js', () => ({
  prisma: mockPrismaClient
}));

const { CouponService, CouponExpiredError, CouponExhaustedError, MinOrderError } = await import('../coupon.service.js');

describe('CouponService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('Valid coupon code → applies PERCENTAGE discount correctly (20% of subtotal)', async () => {
    mockPrismaClient.coupon.findUnique.mockResolvedValueOnce({ code: 'SAVE20', type: 'PERCENTAGE', value: 20, minOrder: 0, expiresAt: new Date(Date.now() + 100000), usageLimit: 100, usedCount: 0 });
    const result = await CouponService.applyCoupon('SAVE20', { subtotal: 100 });
    expect(result.discount).toBe(20);
    expect(result.newTotal).toBe(80);
  });

  it('Valid coupon → applies FIXED_AMOUNT discount correctly', async () => {
    mockPrismaClient.coupon.findUnique.mockResolvedValueOnce({ code: 'MINUS10', type: 'FIXED_AMOUNT', value: 10, minOrder: 0, expiresAt: new Date(Date.now() + 100000), usageLimit: 100, usedCount: 0 });
    const result = await CouponService.applyCoupon('MINUS10', { subtotal: 50 });
    expect(result.discount).toBe(10);
    expect(result.newTotal).toBe(40);
  });

  it('Expired coupon → throws CouponExpiredError', async () => {
    mockPrismaClient.coupon.findUnique.mockResolvedValueOnce({ code: 'OLD', type: 'PERCENTAGE', value: 10, minOrder: 0, expiresAt: new Date(Date.now() - 100000) });
    await expect(CouponService.applyCoupon('OLD', { subtotal: 100 })).rejects.toThrow(CouponExpiredError);
  });

  it('Coupon usage limit reached → throws CouponExhaustedError', async () => {
    mockPrismaClient.coupon.findUnique.mockResolvedValueOnce({ code: 'LIMIT', type: 'PERCENTAGE', value: 10, minOrder: 0, expiresAt: new Date(Date.now() + 100000), usageLimit: 5, usedCount: 5 });
    await expect(CouponService.applyCoupon('LIMIT', { subtotal: 100 })).rejects.toThrow(CouponExhaustedError);
  });

  it('Minimum order value not met → throws MinOrderError with required amount', async () => {
    mockPrismaClient.coupon.findUnique.mockResolvedValueOnce({ code: 'MIN50', type: 'PERCENTAGE', value: 10, minOrder: 50, expiresAt: new Date(Date.now() + 100000), usageLimit: 100, usedCount: 0 });
    await expect(CouponService.applyCoupon('MIN50', { subtotal: 40 })).rejects.toThrow(MinOrderError);
  });

  it('Coupon for specific category → only applies to matching items', async () => {
    mockPrismaClient.coupon.findUnique.mockResolvedValueOnce({ code: 'TECH10', type: 'PERCENTAGE', value: 10, minOrder: 0, category: 'TECH', expiresAt: new Date(Date.now() + 100000) });
    const items = [{ price: 100, category: 'TECH' }, { price: 50, category: 'FOOD' }];
    const result = await CouponService.applyCoupon('TECH10', { subtotal: 150, items });
    expect(result.discount).toBe(10); // 10% of 100
    expect(result.newTotal).toBe(140);
  });

  it('BOGO deal → buy 2 get 1 free calculation correct', async () => {
    mockPrismaClient.coupon.findUnique.mockResolvedValueOnce({ code: 'BOGO', type: 'BOGO', expiresAt: new Date(Date.now() + 100000) });
    const items = [{ id: 'p1', price: 20, quantity: 3 }];
    const result = await CouponService.applyCoupon('BOGO', { subtotal: 60, items });
    expect(result.discount).toBe(20);
    expect(result.newTotal).toBe(40);
  });

  it('Flash sale discount → applies time-limited percentage', async () => {
    mockPrismaClient.coupon.findUnique.mockResolvedValueOnce({ code: 'FLASH', type: 'PERCENTAGE', value: 50, expiresAt: new Date(Date.now() + 300000) });
    const result = await CouponService.applyCoupon('FLASH', { subtotal: 100 });
    expect(result.discount).toBe(50);
  });

  it('Stacking: multiple discount codes → only best discount applied (no stacking by default)', async () => {
    mockPrismaClient.coupon.findUnique.mockResolvedValueOnce({ code: 'C1', type: 'PERCENTAGE', value: 10 });
    mockPrismaClient.coupon.findUnique.mockResolvedValueOnce({ code: 'C2', type: 'PERCENTAGE', value: 20 });
    const result = await CouponService.applyBestCoupon(['C1', 'C2'], { subtotal: 100 });
    expect(result.discount).toBe(20);
    expect(result.code).toBe('C2');
  });

  it('applyCoupon increments usage count in DB after successful application', async () => {
    mockPrismaClient.coupon.findUnique.mockResolvedValueOnce({ id: 1, code: 'SAVE10', type: 'PERCENTAGE', value: 10, minOrder: 0, expiresAt: new Date(Date.now() + 10000), usageLimit: 100, usedCount: 0 });
    await CouponService.commitCoupon('SAVE10');
    expect(mockPrismaClient.coupon.update).toHaveBeenCalledWith({ where: { code: 'SAVE10' }, data: { usedCount: { increment: 1 } } });
  });
});
