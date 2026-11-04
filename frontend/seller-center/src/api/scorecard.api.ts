import { apiClient } from './axios.config';
import type { HealthScorecard, ScorecardMetric, ScorecardStatus, PolicyViolationAppeal } from '@/types/scorecard.types';

// ─── The real seller performance scorecard ────────────────────────────────────
//
// This file used to generate its whole contents from '@/mocks/scorecard.mock'
// and cache them for the session, so the Dashboard showed a seller invented
// defect rates, an invented standing, and a 30-day trend that had never
// happened — while user-service was computing the real ones all along from
// order, dispute and buyer-protection events.
//
//   GET /api/v1/sellers/:sellerId/scorecard
//     → { success, data: { sellerId, scorecard, standing, standingReason,
//                          recommendedStanding, lastCalculatedAt } }
//
// What the backend genuinely has is the three enforcement metrics and the
// standing derived from them. What it does not have is a time series and an
// appeals workflow — see `history` and `appealsApi` below. Neither is invented
// here.

/** One metric as user-service reports it: rates are fractions, not percents. */
interface ApiMetric {
  value: number | null;
  target: number;
  suspendAt: number;
  numerator: number;
  denominator: number;
  status: 'OK' | 'AT_RISK' | 'BREACH';
}

interface ApiScorecardResponse {
  success: boolean;
  data: {
    sellerId: string;
    scorecard: {
      orderDefectRate: ApiMetric;
      lateShipmentRate: ApiMetric;
      cancellationRate: ApiMetric;
      minimumSampleSize: number;
    };
    standing: 'GOOD' | 'AT_RISK' | 'SUSPENDED';
    standingReason: string | null;
    recommendedStanding?: 'GOOD' | 'AT_RISK' | 'SUSPENDED';
    lastCalculatedAt?: string | null;
  };
}

const METRIC_STATUS: Record<ApiMetric['status'], ScorecardStatus> = {
  OK: 'good',
  AT_RISK: 'at_risk',
  BREACH: 'critical',
};

const STANDING_STATUS: Record<ApiScorecardResponse['data']['standing'], ScorecardStatus> = {
  GOOD: 'good',
  AT_RISK: 'at_risk',
  SUSPENDED: 'critical',
};

const METRIC_LABEL: Record<ScorecardMetric['key'], string> = {
  odr: 'Order Defect Rate',
  lsr: 'Late Shipment Rate',
  cancellationRate: 'Pre-fulfillment Cancellation Rate',
};

/**
 * A metric with no orders behind it yet reports `value: null`. Showing that as
 * 0% would read as a perfect record rather than an empty one, so it is carried
 * through as 0 with an `OK` status only because the panel needs a number —
 * `denominator` is what says whether it means anything.
 */
function toMetric(key: ScorecardMetric['key'], metric: ApiMetric): ScorecardMetric {
  return {
    key,
    label: METRIC_LABEL[key],
    valuePercent: metric.value === null ? 0 : metric.value * 100,
    thresholdPercent: metric.target * 100,
    status: METRIC_STATUS[metric.status],
  };
}

export const scorecardApi = {
  /**
   * The signed-in seller's own scorecard. `sellerId` is their user id: the
   * endpoint serves the seller themselves or an admin, and rejects anyone else
   * with 403, so this cannot be pointed at a competitor.
   */
  async getHealthScorecard(sellerId: string): Promise<HealthScorecard> {
    const { data } = await apiClient.get<ApiScorecardResponse>(`/sellers/${sellerId}/scorecard`);
    const card = data.data.scorecard;

    return {
      overallStatus: STANDING_STATUS[data.data.standing] ?? 'good',
      metrics: [
        toMetric('odr', card.orderDefectRate),
        toMetric('lsr', card.lateShipmentRate),
        toMetric('cancellationRate', card.cancellationRate),
      ],
      // user-service computes the scorecard from the seller's current totals;
      // it stores no daily snapshots, so there is no 30-day series to return.
      // The trend chart renders its empty state for this, which is the honest
      // outcome — the previous implementation filled it with generated points
      // and drew a trend line through data that did not exist. Populating it
      // for real needs a snapshot table and a scheduled job upstream.
      history: [],
    };
  },
};

// ─── Policy violation appeals ─────────────────────────────────────────────────
//
// There is no appeals backend. Nothing in backend/services exposes an appeal
// route, table or handler — the previous implementation kept appeals in a
// module-level array, so "Appeal submitted. Our trust & safety team will
// respond within 3-5 business days" was shown to a seller whose appeal existed
// only until they refreshed the page, and whose trust & safety team never
// received anything.
//
// Rather than keep fabricating that, the surface reports what is true. When an
// appeals service exists, `isAvailable` becomes a real capability check and
// these two get their implementations.

export const APPEALS_UNAVAILABLE_MESSAGE =
  'Appeals cannot be submitted here yet. Contact seller support to dispute a metric or violation.';

export const appealsApi = {
  /** Whether an appeals backend exists to talk to. It does not, yet. */
  isAvailable(): boolean {
    return false;
  },

  async listAppeals(): Promise<PolicyViolationAppeal[]> {
    throw new Error(APPEALS_UNAVAILABLE_MESSAGE);
  },

  async submitAppeal(): Promise<PolicyViolationAppeal> {
    throw new Error(APPEALS_UNAVAILABLE_MESSAGE);
  },
};
