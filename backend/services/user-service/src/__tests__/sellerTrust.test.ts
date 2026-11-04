import { describe, it, expect, beforeAll } from '@jest/globals';

// config/env.ts fails fast on missing configuration, which is correct at
// runtime but means these must be set before the module graph is imported.
// Hence the dynamic import in beforeAll rather than a top-level one.
process.env.DATABASE_URL ??= 'postgresql://muni:muni@localhost:5432/muni_user_test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';

type SellerTrustModule = typeof import('../services/sellerTrust.service.js');
let trust: SellerTrustModule;

beforeAll(async () => {
  trust = await import('../services/sellerTrust.service.js');
});

/** A stats row with everything at zero; each test sets only what it exercises. */
function stats(overrides: Record<string, unknown> = {}) {
  return {
    id: 'stats-1',
    userId: 'seller-1',
    totalOrders: 0,
    onTimeDeliveries: 0,
    lateDeliveries: 0,
    disputesOpened: 0,
    disputesResolvedSellerFavor: 0,
    disputesResolvedBuyerFavor: 0,
    defectReportsINAD: 0,
    slaBreaches: 0,
    lateShipments: 0,
    cancelledBySeller: 0,
    ordersAccepted: 0,
    claimsGranted: 0,
    policyViolations: 0,
    totalResponseHours: 0,
    resolvedResponseCount: 0,
    isVerifiedMerchant: false,
    trustScore: 70,
    badges: [] as string[],
    standing: 'GOOD',
    standingReason: null,
    standingChangedAt: null,
    lastCalculatedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('computeScore', () => {
  it('gives a brand-new seller the cold-start score rather than zero', () => {
    // Scoring an unknown seller at 0 would bury them permanently; there is no
    // evidence either way yet.
    const result = trust.computeScore(stats());
    expect(result.trustScore).toBe(70);
    expect(result.breakdown).toBeNull();
  });

  it('scores a flawless seller at the top', () => {
    const result = trust.computeScore(
      stats({ totalOrders: 50, onTimeDeliveries: 50, resolvedResponseCount: 5, totalResponseHours: 0 }),
    );
    expect(result.trustScore).toBe(100);
    expect(result.breakdown?.onTimeDeliveryRate).toBe(1);
  });

  it('counts a dispute as at least one order so the rate stays well-defined', () => {
    // A non-delivery claim can arrive before any delivery signal, leaving
    // totalOrders at 0. The denominator must not be zero, and the dispute must
    // not be silently ignored.
    const result = trust.computeScore(stats({ totalOrders: 0, disputesOpened: 1 }));
    expect(result.breakdown?.disputeRate).toBe(1);
    expect(result.trustScore).toBeLessThan(70);
  });

  it('penalises late delivery', () => {
    const punctual = trust.computeScore(stats({ totalOrders: 10, onTimeDeliveries: 10 })).trustScore;
    const tardy = trust.computeScore(
      stats({ totalOrders: 10, onTimeDeliveries: 5, lateDeliveries: 5 }),
    ).trustScore;
    expect(tardy).toBeLessThan(punctual);
  });
});

describe('assignBadges', () => {
  it('awards Top Rated Seller only with enough volume behind the score', () => {
    const excellent = stats({ totalOrders: 25, onTimeDeliveries: 25 });
    expect(trust.assignBadges(excellent, 100)).toContain('Top Rated Seller');

    // Same perfect record, too few orders to mean anything.
    const unproven = stats({ totalOrders: 3, onTimeDeliveries: 3 });
    expect(trust.assignBadges(unproven, 100)).not.toContain('Top Rated Seller');
  });

  it('awards Fast Shipper on delivery punctuality alone', () => {
    const badges = trust.assignBadges(stats({ totalOrders: 12, onTimeDeliveries: 12 }), 80);
    expect(badges).toContain('Fast Shipper');
  });

  it('awards Verified Merchant only when an admin has granted it', () => {
    expect(trust.assignBadges(stats({ isVerifiedMerchant: true }), 70)).toContain('Verified Merchant');
    expect(trust.assignBadges(stats({ isVerifiedMerchant: false }), 70)).not.toContain(
      'Verified Merchant',
    );
  });
});

describe('buildScorecard', () => {
  it('reports insufficient data below the minimum sample size', () => {
    // Three orders and one defect is 33%, far past the suspension threshold —
    // and completely meaningless.
    const card = trust.buildScorecard(stats({ ordersAccepted: 3, defectReportsINAD: 1 }));
    expect(card.orderDefectRate.status).toBe('INSUFFICIENT_DATA');
  });

  it('counts granted claims as defects alongside INAD reports', () => {
    const card = trust.buildScorecard(
      stats({ ordersAccepted: 100, defectReportsINAD: 2, claimsGranted: 3 }),
    );
    expect(card.orderDefectRate.numerator).toBe(5);
    expect(card.orderDefectRate.value).toBe(0.05);
  });

  it('exposes the numerator and denominator behind each rate', () => {
    const card = trust.buildScorecard(stats({ ordersAccepted: 200, lateShipments: 10 }));
    expect(card.lateShipmentRate.numerator).toBe(10);
    expect(card.lateShipmentRate.denominator).toBe(200);
    expect(card.lateShipmentRate.value).toBe(0.05);
  });
});

describe('evaluateStanding', () => {
  it('leaves a clean, established seller in good standing', () => {
    const result = trust.evaluateStanding(stats({ ordersAccepted: 100, totalOrders: 100 }));
    expect(result.standing).toBe('GOOD');
    expect(result.reason).toBeNull();
  });

  it('never suspends on too little history', () => {
    // 100% defect rate on a single order.
    const result = trust.evaluateStanding(stats({ ordersAccepted: 1, claimsGranted: 1 }));
    expect(result.standing).toBe('GOOD');
  });

  it('flags at risk once a metric passes target but not the limit', () => {
    // 2% ODR: above the 1% target, below the 5% suspension limit.
    const result = trust.evaluateStanding(stats({ ordersAccepted: 100, claimsGranted: 2 }));
    expect(result.standing).toBe('AT_RISK');
    expect(result.reason).toContain('order defect rate');
  });

  it('recommends suspension once a metric passes the policy limit', () => {
    // 6% ODR, past the 5% limit.
    const result = trust.evaluateStanding(stats({ ordersAccepted: 100, claimsGranted: 6 }));
    expect(result.standing).toBe('SUSPENDED');
    expect(result.reason).toContain('Above policy limit');
  });

  it('flags at risk for an open policy violation even when the metrics are clean', () => {
    const result = trust.evaluateStanding(stats({ ordersAccepted: 100, policyViolations: 1 }));
    expect(result.standing).toBe('AT_RISK');
    expect(result.reason).toContain('policy violation');
  });

  it('names the offending metric and both thresholds in the reason', () => {
    // The reason is shown to the seller, so it has to say what to fix.
    const result = trust.evaluateStanding(stats({ ordersAccepted: 100, lateShipments: 12 }));
    expect(result.standing).toBe('SUSPENDED');
    expect(result.reason).toContain('late shipment rate');
    expect(result.reason).toContain('12.0%');
    expect(result.reason).toContain('10.0%');
  });
});
