import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── The scorecard is the seller's real record, not a generated one ───────────
//
// This module used to build its whole response from '@/mocks/scorecard.mock':
// invented defect rates, an invented standing, and a 30-day trend line drawn
// through points that had never happened — all cached per session so it looked
// stable enough to believe. user-service had been computing the real figures
// from order, dispute and buyer-protection events the entire time.
//
// These pin the mapping onto that endpoint, and pin the two things the backend
// genuinely does not have so they cannot quietly be filled in again.

const get = vi.fn();
vi.mock('../axios.config', () => ({ apiClient: { get }, default: { get } }));

const { scorecardApi, appealsApi, APPEALS_UNAVAILABLE_MESSAGE } = await import('../scorecard.api');

/** Rates come back as fractions; the panel wants percents. */
const metric = (value: number | null, target: number, status: string, denominator = 40) => ({
  value, target, suspendAt: target * 5, numerator: 2, denominator, status,
});

const respond = (standing: string, card: Record<string, unknown>) => {
  get.mockResolvedValue({
    data: {
      success: true,
      data: {
        sellerId: 'seller-1',
        scorecard: { ...card, minimumSampleSize: 10 },
        standing,
        standingReason: null,
        lastCalculatedAt: '2026-09-01T00:00:00.000Z',
      },
    },
  });
};

const healthyCard = {
  orderDefectRate: metric(0.012, 0.01, 'AT_RISK'),
  lateShipmentRate: metric(0.02, 0.04, 'OK'),
  cancellationRate: metric(0.08, 0.025, 'BREACH'),
};

beforeEach(() => vi.clearAllMocks());

describe('it asks the real endpoint', () => {
  it('fetches the signed-in seller by id', async () => {
    respond('GOOD', healthyCard);
    await scorecardApi.getHealthScorecard('seller-1');

    expect(get).toHaveBeenCalledWith('/sellers/seller-1/scorecard');
  });
});

describe('it reports what the backend computed', () => {
  it('converts fractional rates to percents', async () => {
    respond('AT_RISK', healthyCard);
    const card = await scorecardApi.getHealthScorecard('seller-1');

    expect(card.metrics.find((m) => m.key === 'odr')!.valuePercent).toBeCloseTo(1.2);
    expect(card.metrics.find((m) => m.key === 'lsr')!.valuePercent).toBeCloseTo(2);
    expect(card.metrics.find((m) => m.key === 'odr')!.thresholdPercent).toBeCloseTo(1);
  });

  it('carries each metric status through', async () => {
    respond('AT_RISK', healthyCard);
    const card = await scorecardApi.getHealthScorecard('seller-1');

    expect(card.metrics.find((m) => m.key === 'odr')!.status).toBe('at_risk');
    expect(card.metrics.find((m) => m.key === 'lsr')!.status).toBe('good');
    expect(card.metrics.find((m) => m.key === 'cancellationRate')!.status).toBe('critical');
  });

  it('takes the overall status from the standing the backend derived', async () => {
    respond('SUSPENDED', healthyCard);
    expect((await scorecardApi.getHealthScorecard('seller-1')).overallStatus).toBe('critical');

    respond('GOOD', healthyCard);
    expect((await scorecardApi.getHealthScorecard('seller-1')).overallStatus).toBe('good');
  });

  it('does not invent a figure for a seller with no orders yet', async () => {
    respond('GOOD', {
      orderDefectRate: metric(null, 0.01, 'OK', 0),
      lateShipmentRate: metric(null, 0.04, 'OK', 0),
      cancellationRate: metric(null, 0.025, 'OK', 0),
    });
    const card = await scorecardApi.getHealthScorecard('seller-1');

    expect(card.metrics.every((m) => m.valuePercent === 0)).toBe(true);
    expect(card.overallStatus).toBe('good');
  });
});

describe('what the backend does not have, it does not fabricate', () => {
  it('returns no trend history, because no snapshots are stored', async () => {
    respond('GOOD', healthyCard);
    const card = await scorecardApi.getHealthScorecard('seller-1');

    // The chart renders its empty state for this. The previous implementation
    // generated 30 days of points and drew a line through them.
    expect(card.history).toEqual([]);
  });

  it('does not accept an appeal there is no backend to receive', async () => {
    expect(appealsApi.isAvailable()).toBe(false);
    await expect(appealsApi.submitAppeal()).rejects.toThrow(APPEALS_UNAVAILABLE_MESSAGE);
    await expect(appealsApi.listAppeals()).rejects.toThrow(APPEALS_UNAVAILABLE_MESSAGE);
  });

  it('does not promise a trust & safety response', async () => {
    // "Our trust & safety team will respond within 3-5 business days" was
    // shown for an appeal that was pushed onto an array and lost on reload.
    expect(APPEALS_UNAVAILABLE_MESSAGE).not.toMatch(/business days/i);
    expect(APPEALS_UNAVAILABLE_MESSAGE).toMatch(/seller support/i);
  });
});

describe('a failure is surfaced, not replaced with invented data', () => {
  it('propagates a 403 rather than falling back to a generated scorecard', async () => {
    get.mockRejectedValue(Object.assign(new Error('Forbidden'), { response: { status: 403 } }));

    await expect(scorecardApi.getHealthScorecard('someone-else')).rejects.toThrow(/forbidden/i);
  });
});
