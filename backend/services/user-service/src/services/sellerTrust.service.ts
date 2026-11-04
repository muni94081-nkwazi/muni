import type { SellerStanding, SellerTrustStats } from '../generated/prisma/index.js';
import prisma from '../config/prisma.js';
import ApiError from '../utils/ApiError.js';
import { publish, TOPICS } from '../events/publisher.js';

/**
 * Seller Trust Score (0-100) and badge assignment.
 *
 * Score is a weighted blend of four signals:
 *   - on-time delivery rate   (35 pts)
 *   - dispute rate, inverse   (25 pts)
 *   - item-defect/INAD rate, inverse (25 pts)
 *   - response time vs. the dispute-service 72h SLA (15 pts)
 *
 * Denominators use `totalOrders` — the count of delivery signals we've
 * actually observed for this seller (see recordEvent). That undercounts
 * true order volume for disputes filed before any delivery signal arrives
 * (e.g. a non-delivery claim), so dispute/defect rates use
 * `Math.max(totalOrders, count)` as their denominator instead of raw
 * totalOrders — every dispute/defect counts as at least one order even if
 * we never separately heard about its delivery. This keeps the rate always
 * well-defined (no div-by-zero) without silently hiding signals.
 */

const WEIGHTS = { ON_TIME: 35, DISPUTE: 25, DEFECT: 25, RESPONSE: 15 };
const NEUTRAL_RATE = 0.7; // used when there isn't enough data yet for a signal
const COLD_START_SCORE = 70;
const RESPONSE_SLA_HOURS = 72;

const BADGE_THRESHOLDS = {
  TOP_RATED_SELLER: { minScore: 95, minOrders: 20, maxDisputeRate: 0.02 },
  FAST_SHIPPER: { minDeliverySamples: 10, minOnTimeRate: 0.95 },
};

/**
 * Policy thresholds for the *enforcement* scorecard, which answers a
 * different question from the trust score: trust ranks sellers against each
 * other, standing asks whether this seller is in breach. Values mirror
 * Industry-standard seller-performance targets, with a minimum sample size
 * so a seller's first bad order can't suspend them.
 */
const POLICY = {
  MIN_SAMPLE: 10,
  orderDefectRate: { atRisk: 0.01, suspend: 0.05 },
  lateShipmentRate: { atRisk: 0.04, suspend: 0.1 },
  cancellationRate: { atRisk: 0.025, suspend: 0.075 },
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export interface ScoreBreakdown {
  onTimeDeliveryRate: number;
  disputeRate: number;
  defectRateINAD: number;
  avgResponseTimeHours: number | null;
}

export function computeScore(stats: SellerTrustStats): {
  trustScore: number;
  breakdown: ScoreBreakdown | null;
} {
  const deliverySamples = stats.onTimeDeliveries + stats.lateDeliveries;
  const hasAnySignal =
    stats.totalOrders > 0 || stats.disputesOpened > 0 || stats.defectReportsINAD > 0;

  if (!hasAnySignal) {
    return { trustScore: COLD_START_SCORE, breakdown: null };
  }

  const onTimeRate = deliverySamples > 0 ? stats.onTimeDeliveries / deliverySamples : NEUTRAL_RATE;

  const disputeDenominator = Math.max(stats.totalOrders, stats.disputesOpened, 1);
  const disputeRate = stats.disputesOpened / disputeDenominator;

  const defectDenominator = Math.max(stats.totalOrders, stats.defectReportsINAD, 1);
  const defectRate = stats.defectReportsINAD / defectDenominator;

  const avgResponseHours =
    stats.resolvedResponseCount > 0 ? stats.totalResponseHours / stats.resolvedResponseCount : null;
  const responseRatio =
    avgResponseHours === null ? NEUTRAL_RATE : clamp(1 - avgResponseHours / RESPONSE_SLA_HOURS, 0, 1);

  const onTimeComponent = onTimeRate * WEIGHTS.ON_TIME;
  const disputeComponent = (1 - clamp(disputeRate, 0, 1)) * WEIGHTS.DISPUTE;
  const defectComponent = (1 - clamp(defectRate, 0, 1)) * WEIGHTS.DEFECT;
  const responseComponent = responseRatio * WEIGHTS.RESPONSE;

  const trustScore = Math.round(
    clamp(onTimeComponent + disputeComponent + defectComponent + responseComponent, 0, 100),
  );

  return {
    trustScore,
    breakdown: {
      onTimeDeliveryRate: Math.round(onTimeRate * 1000) / 1000,
      disputeRate: Math.round(disputeRate * 1000) / 1000,
      defectRateINAD: Math.round(defectRate * 1000) / 1000,
      avgResponseTimeHours:
        avgResponseHours === null ? null : Math.round(avgResponseHours * 100) / 100,
    },
  };
}

export function assignBadges(stats: SellerTrustStats, trustScore: number): string[] {
  const badges: string[] = [];
  const deliverySamples = stats.onTimeDeliveries + stats.lateDeliveries;
  const disputeDenominator = Math.max(stats.totalOrders, stats.disputesOpened, 1);
  const disputeRate = stats.disputesOpened / disputeDenominator;

  const t = BADGE_THRESHOLDS.TOP_RATED_SELLER;
  if (trustScore >= t.minScore && stats.totalOrders >= t.minOrders && disputeRate <= t.maxDisputeRate) {
    badges.push('Top Rated Seller');
  }

  const f = BADGE_THRESHOLDS.FAST_SHIPPER;
  if (
    deliverySamples >= f.minDeliverySamples &&
    stats.onTimeDeliveries / deliverySamples >= f.minOnTimeRate
  ) {
    badges.push('Fast Shipper');
  }

  if (stats.isVerifiedMerchant) {
    badges.push('Verified Merchant');
  }

  return badges;
}

// ─── Performance Scorecard & Enforcement ────────────────────────────────────

export type MetricStatus = 'GOOD' | 'AT_RISK' | 'BREACH' | 'INSUFFICIENT_DATA';

export interface ScorecardMetric {
  value: number | null;
  target: number;
  suspendAt: number;
  /** Raw numerator/denominator so a seller can see what the rate is made of. */
  numerator: number;
  denominator: number;
  status: MetricStatus;
}

function rate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

function metricStatus(
  value: number | null,
  denominator: number,
  thresholds: { atRisk: number; suspend: number },
): MetricStatus {
  if (value === null || denominator < POLICY.MIN_SAMPLE) return 'INSUFFICIENT_DATA';
  if (value >= thresholds.suspend) return 'BREACH';
  if (value >= thresholds.atRisk) return 'AT_RISK';
  return 'GOOD';
}

export interface Scorecard {
  orderDefectRate: ScorecardMetric;
  lateShipmentRate: ScorecardMetric;
  cancellationRate: ScorecardMetric;
  minimumSampleSize: number;
}

export function buildScorecard(stats: SellerTrustStats): Scorecard {
  // Defects are the union of INAD reports and granted claims — both mean the
  // buyer did not get what they paid for. Denominator is orders accepted,
  // falling back to delivery signals for sellers onboarded before
  // ordersAccepted was tracked.
  const defectDenominator = Math.max(stats.ordersAccepted, stats.totalOrders);
  const defectNumerator = stats.defectReportsINAD + stats.claimsGranted;
  const odr = rate(defectNumerator, defectDenominator);

  const lsr = rate(stats.lateShipments, stats.ordersAccepted);
  const cr = rate(stats.cancelledBySeller, stats.ordersAccepted);

  return {
    orderDefectRate: {
      value: odr === null ? null : Math.round(odr * 10000) / 10000,
      target: POLICY.orderDefectRate.atRisk,
      suspendAt: POLICY.orderDefectRate.suspend,
      numerator: defectNumerator,
      denominator: defectDenominator,
      status: metricStatus(odr, defectDenominator, POLICY.orderDefectRate),
    },
    lateShipmentRate: {
      value: lsr === null ? null : Math.round(lsr * 10000) / 10000,
      target: POLICY.lateShipmentRate.atRisk,
      suspendAt: POLICY.lateShipmentRate.suspend,
      numerator: stats.lateShipments,
      denominator: stats.ordersAccepted,
      status: metricStatus(lsr, stats.ordersAccepted, POLICY.lateShipmentRate),
    },
    cancellationRate: {
      value: cr === null ? null : Math.round(cr * 10000) / 10000,
      target: POLICY.cancellationRate.atRisk,
      suspendAt: POLICY.cancellationRate.suspend,
      numerator: stats.cancelledBySeller,
      denominator: stats.ordersAccepted,
      status: metricStatus(cr, stats.ordersAccepted, POLICY.cancellationRate),
    },
    minimumSampleSize: POLICY.MIN_SAMPLE,
  };
}

function formatPercent(value: number): string {
  return (value * 100).toFixed(1) + '%';
}

/**
 * Derives standing from the scorecard. Deliberately never returns SUSPENDED
 * for a seller with too little history — an account with three orders and one
 * bad one sits at 33% ODR, and suspending on that would be noise, not policy.
 *
 * This computes the *recommendation*; it does not itself suspend anyone.
 * Applying it is `applyStanding`, which an admin action or a scheduled job
 * calls, so a suspension is always an explicit act carrying an audit event.
 */
export function evaluateStanding(stats: SellerTrustStats): {
  standing: SellerStanding;
  reason: string | null;
} {
  const card = buildScorecard(stats);
  const metrics: Array<[string, ScorecardMetric]> = [
    ['order defect rate', card.orderDefectRate],
    ['late shipment rate', card.lateShipmentRate],
    ['cancellation rate', card.cancellationRate],
  ];

  const breaches = metrics.filter(([, m]) => m.status === 'BREACH');
  if (breaches.length > 0) {
    const detail = breaches
      .map(([name, m]) => name + ' ' + formatPercent(m.value ?? 0) + ' (limit ' + formatPercent(m.suspendAt) + ')')
      .join('; ');
    return { standing: 'SUSPENDED', reason: 'Above policy limit: ' + detail };
  }

  const atRisk = metrics.filter(([, m]) => m.status === 'AT_RISK');
  if (atRisk.length > 0) {
    const detail = atRisk
      .map(([name, m]) => name + ' ' + formatPercent(m.value ?? 0) + ' (target ' + formatPercent(m.target) + ')')
      .join('; ');
    return { standing: 'AT_RISK', reason: 'Above target: ' + detail };
  }

  if (stats.policyViolations > 0) {
    return { standing: 'AT_RISK', reason: stats.policyViolations + ' open policy violation(s)' };
  }

  return { standing: 'GOOD', reason: null };
}

async function getOrCreateStats(sellerId: string): Promise<SellerTrustStats> {
  return prisma.sellerTrustStats.upsert({
    where: { userId: sellerId },
    update: {},
    create: { userId: sellerId },
  });
}

/** Recalculates and persists the cached score/badges from a stats row already in hand. */
async function recalculate(stats: SellerTrustStats): Promise<SellerTrustStats> {
  const { trustScore } = computeScore(stats);
  const badges = assignBadges(stats, trustScore);

  return prisma.sellerTrustStats.update({
    where: { userId: stats.userId },
    data: { trustScore, badges, lastCalculatedAt: new Date() },
  });
}

type CounterField = keyof Pick<
  SellerTrustStats,
  | 'totalOrders'
  | 'onTimeDeliveries'
  | 'lateDeliveries'
  | 'disputesOpened'
  | 'disputesResolvedSellerFavor'
  | 'disputesResolvedBuyerFavor'
  | 'defectReportsINAD'
  | 'slaBreaches'
  | 'lateShipments'
  | 'cancelledBySeller'
  | 'ordersAccepted'
  | 'claimsGranted'
  | 'policyViolations'
  | 'totalResponseHours'
  | 'resolvedResponseCount'
>;

const COUNTER_INCREMENTS: Record<string, Partial<Record<CounterField, number>>> = {
  ORDER_DELIVERED_ON_TIME: { totalOrders: 1, onTimeDeliveries: 1 },
  ORDER_DELIVERED_LATE: { totalOrders: 1, lateDeliveries: 1 },
  DISPUTE_OPENED: { disputesOpened: 1 },
  DISPUTE_RESOLVED_SELLER_FAVOR: { disputesResolvedSellerFavor: 1 },
  DISPUTE_RESOLVED_BUYER_FAVOR: { disputesResolvedBuyerFavor: 1 },
  ITEM_DEFECT_REPORTED: { defectReportsINAD: 1 },
  SLA_BREACHED: { slaBreaches: 1 },
  // ── Performance-scorecard events ─────────────────────────────────────────
  ORDER_ACCEPTED: { ordersAccepted: 1 },
  SHIPMENT_LATE: { lateShipments: 1 },
  ORDER_CANCELLED_BY_SELLER: { cancelledBySeller: 1 },
  CLAIM_GRANTED: { claimsGranted: 1 },
  POLICY_VIOLATION: { policyViolations: 1 },
};

export const TRUST_EVENT_TYPES = Object.keys(COUNTER_INCREMENTS);

const RESPONSE_TRACKED_EVENTS = new Set([
  'DISPUTE_RESOLVED_SELLER_FAVOR',
  'DISPUTE_RESOLVED_BUYER_FAVOR',
]);

export interface TrustEvent {
  eventType: string;
  orderId?: string;
  disputeId?: string;
  responseTimeHours?: number;
  occurredAt?: string;
}

/**
 * Ingests one trust-relevant event for a seller, updates the raw counters,
 * and recalculates the cached score/badges. Called by dispute-service
 * (dispute lifecycle events), order-service (acceptance, late shipment,
 * seller cancellation) and buyer-protection-service (delivery timing), or
 * directly by an admin action for merchant verification.
 */
export async function recordEvent(sellerId: string, event: TrustEvent): Promise<SellerTrustStats> {
  const base = COUNTER_INCREMENTS[event.eventType];
  if (!base || Object.keys(base).length === 0) {
    throw ApiError.badRequest('Unknown trust event type: ' + event.eventType);
  }

  const increments: Partial<Record<CounterField, number>> = { ...base };

  if (RESPONSE_TRACKED_EVENTS.has(event.eventType) && typeof event.responseTimeHours === 'number') {
    increments.totalResponseHours = Math.max(event.responseTimeHours, 0);
    increments.resolvedResponseCount = 1;
  }

  // Same starting values work for both branches: on create, "increment N
  // from zero" is just "start at N"; on update, Prisma's {increment} atomically
  // bumps the existing counter.
  const updateData = Object.fromEntries(
    Object.entries(increments).map(([field, amount]) => [field, { increment: amount }]),
  );

  await prisma.sellerTrustStats.upsert({
    where: { userId: sellerId },
    update: updateData,
    create: { userId: sellerId, ...increments },
  });

  const stats = await prisma.sellerTrustStats.findUniqueOrThrow({ where: { userId: sellerId } });
  return recalculate(stats);
}

export interface TrustProfile {
  sellerId: string;
  trustScore: number;
  badges: string[];
  breakdown: ScoreBreakdown | null;
  scorecard: Scorecard;
  standing: SellerStanding;
  standingReason: string | null;
  /** What evaluateStanding() would set right now, which may differ from the applied standing. */
  recommendedStanding: SellerStanding;
  stats: Record<string, number | boolean>;
  lastCalculatedAt: Date;
}

/** Public-facing trust profile — storefront badge display, seller dashboard, etc. */
export async function getTrustProfile(sellerId: string): Promise<TrustProfile> {
  const stats = await getOrCreateStats(sellerId);
  const { trustScore, breakdown } = computeScore(stats);
  const badges = assignBadges(stats, trustScore);
  const recommendation = evaluateStanding(stats);

  return {
    sellerId,
    trustScore,
    badges,
    breakdown,
    scorecard: buildScorecard(stats),
    standing: stats.standing,
    standingReason: stats.standingReason,
    recommendedStanding: recommendation.standing,
    stats: {
      totalOrders: stats.totalOrders,
      ordersAccepted: stats.ordersAccepted,
      onTimeDeliveries: stats.onTimeDeliveries,
      lateDeliveries: stats.lateDeliveries,
      lateShipments: stats.lateShipments,
      cancelledBySeller: stats.cancelledBySeller,
      disputesOpened: stats.disputesOpened,
      disputesResolvedSellerFavor: stats.disputesResolvedSellerFavor,
      disputesResolvedBuyerFavor: stats.disputesResolvedBuyerFavor,
      defectReportsINAD: stats.defectReportsINAD,
      claimsGranted: stats.claimsGranted,
      policyViolations: stats.policyViolations,
      slaBreaches: stats.slaBreaches,
      isVerifiedMerchant: stats.isVerifiedMerchant,
    },
    lastCalculatedAt: stats.lastCalculatedAt,
  };
}

/**
 * Applies a standing decision. `standing` omitted means "apply whatever the
 * metrics currently justify" — the path a scheduled review job takes; passing
 * it explicitly is an admin override (e.g. reinstating after an appeal).
 */
export async function applyStanding(
  sellerId: string,
  standing?: SellerStanding,
  reason?: string,
): Promise<SellerTrustStats> {
  const stats = await getOrCreateStats(sellerId);
  const recommendation = evaluateStanding(stats);

  const nextStanding = standing ?? recommendation.standing;
  const nextReason = reason ?? recommendation.reason;

  if (nextStanding === stats.standing) return stats;

  const updated = await prisma.sellerTrustStats.update({
    where: { userId: sellerId },
    data: { standing: nextStanding, standingReason: nextReason, standingChangedAt: new Date() },
  });

  await publish(TOPICS.SELLER_STANDING_CHANGED, {
    userId: sellerId,
    sellerId,
    previousStanding: stats.standing,
    standing: nextStanding,
    reason: nextReason,
  });

  return updated;
}

/** Admin action — grants/revokes the "Verified Merchant" badge eligibility. */
export async function setVerifiedMerchant(
  sellerId: string,
  isVerified: boolean,
): Promise<SellerTrustStats> {
  await getOrCreateStats(sellerId);
  const updated = await prisma.sellerTrustStats.update({
    where: { userId: sellerId },
    data: { isVerifiedMerchant: isVerified },
  });
  return recalculate(updated);
}
