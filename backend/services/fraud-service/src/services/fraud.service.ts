import { prismaFraudRepository } from '../repositories/prisma-fraud.repository.js';
import type {
  FraudCase,
  FraudDecision,
  FraudStats,
  IFraudRepository,
} from '../types/repositories.js';

// ─── Fraud scoring service ────────────────────────────────────────────────────
//
// Assessments live in Postgres behind IFraudRepository. A REVIEW decision
// means an order was held for a human to look at; the Map meant a restart
// silently emptied that queue, leaving the order either blocked with nobody
// able to find it or through unreviewed, with no record it was ever flagged.
//
// Every assessment is stored now, not only the REVIEW ones. The old code kept
// REVIEW cases and counted the rest as three integers, so a BLOCK could not be
// explained after the fact — which is precisely the decision a customer rings
// up to dispute.

/** Rule weights. Named because they decide whether a real order goes through. */
const RULE_SCORES = {
  NEW_ACCOUNT: 30,
  HIGH_VALUE_ORDER: 20,
  ADDRESS_MISMATCH: 10,
  RAPID_ORDERS: 35,
  FAILED_PAYMENTS: 40,
  MULTIPLE_CARDS: 30,
  VELOCITY_CHECK: 30,
  ROUND_AMOUNT: 5,
} as const;

const BLOCK_THRESHOLD = 60;
const REVIEW_THRESHOLD = 31;

const NEW_ACCOUNT_DAYS = 7;
const HIGH_VALUE_THRESHOLD = 500;
const RAPID_ORDER_COUNT = 3;
const FAILED_PAYMENT_COUNT = 2;
const MAX_CARDS = 3;
const VELOCITY_24H_THRESHOLD = 1000;

export interface ScoreInput {
  orderId: string;
  amount: number;
  billingAddress: string;
  shippingAddress: string;
  accountCreatedAt: string;
  recentOrdersCount: number;
  recentFailedPayments: number;
  cardsUsedCount: number;
  amountLast24h: number;
}

export interface ScoreResult {
  orderId: string;
  score: number;
  decision: FraudDecision;
  triggeredRules: string[];
}

let repo: IFraudRepository = prismaFraudRepository;

/** Test seam: point the module at a different repository implementation. */
export function setFraudRepository(next: IFraudRepository): void {
  repo = next;
}

export const scoreTransaction = async (data: ScoreInput): Promise<ScoreResult> => {
  let score = 0;
  const rules: string[] = [];

  const daysOld = (Date.now() - new Date(data.accountCreatedAt).getTime()) / (1000 * 60 * 60 * 24);
  if (daysOld < NEW_ACCOUNT_DAYS) { score += RULE_SCORES.NEW_ACCOUNT; rules.push('NEW_ACCOUNT'); }
  if (data.amount > HIGH_VALUE_THRESHOLD) { score += RULE_SCORES.HIGH_VALUE_ORDER; rules.push('HIGH_VALUE_ORDER'); }
  if (data.billingAddress !== data.shippingAddress) { score += RULE_SCORES.ADDRESS_MISMATCH; rules.push('ADDRESS_MISMATCH'); }
  if (data.recentOrdersCount > RAPID_ORDER_COUNT) { score += RULE_SCORES.RAPID_ORDERS; rules.push('RAPID_ORDERS'); }
  if (data.recentFailedPayments > FAILED_PAYMENT_COUNT) { score += RULE_SCORES.FAILED_PAYMENTS; rules.push('FAILED_PAYMENTS'); }
  if (data.cardsUsedCount > MAX_CARDS) { score += RULE_SCORES.MULTIPLE_CARDS; rules.push('MULTIPLE_CARDS'); }
  if (data.amountLast24h > VELOCITY_24H_THRESHOLD) { score += RULE_SCORES.VELOCITY_CHECK; rules.push('VELOCITY_CHECK'); }
  if (Math.round(data.amount) === data.amount) { score += RULE_SCORES.ROUND_AMOUNT; rules.push('ROUND_AMOUNT'); }

  let decision: FraudDecision = 'ALLOW';
  if (score > BLOCK_THRESHOLD) decision = 'BLOCK';
  else if (score >= REVIEW_THRESHOLD) decision = 'REVIEW';

  const ts = new Date().toISOString();

  // Every verdict is recorded, not just the ones needing review. An order that
  // was blocked has to be explainable afterwards.
  await repo.upsertCase({
    orderId: data.orderId,
    score,
    decision,
    triggeredRules: rules,
    createdAt: ts,
    updatedAt: ts,
  });

  return { orderId: data.orderId, score, decision, triggeredRules: rules };
};

/** The review queue — orders still awaiting a human decision. */
export const listCases = async (): Promise<FraudCase[]> => repo.listCasesForReview();

/** Every assessment, newest first. */
export const listAllCases = async (): Promise<FraudCase[]> => repo.listAllCases();

export const getCase = async (orderId: string): Promise<FraudCase | null> => repo.findCase(orderId);

export const updateCase = async (
  id: string,
  decision: FraudDecision,
  reviewedBy?: string,
): Promise<FraudCase> => {
  const updated = await repo.updateDecision(id, decision, reviewedBy, new Date().toISOString());
  // Same error the Map version threw for an unknown id.
  if (!updated) throw new Error('Not found');
  return updated;
};

/**
 * Counts by decision, derived from the stored cases.
 *
 * The old `stats` object was three integers incremented at scoring time. They
 * reset to zero on restart, and updateCase changed a verdict without touching
 * them — so a reviewed-and-allowed order stayed counted as REVIEW forever.
 */
export const getStats = async (): Promise<FraudStats> => repo.countByDecision();
