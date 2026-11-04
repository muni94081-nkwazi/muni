export type FraudDecision = 'ALLOW' | 'REVIEW' | 'BLOCK';

export interface FraudCase {
  orderId: string;
  score: number;
  decision: FraudDecision;
  triggeredRules: string[];
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FraudStats {
  allowed: number;
  reviewed: number;
  blocked: number;
}

// ─── Repository contract ──────────────────────────────────────────────────────

export interface IFraudRepository {
  /**
   * Store an assessment, replacing any previous verdict for the same order.
   *
   * The Map was keyed by orderId, so re-scoring replaced rather than appended.
   * Kept, so an order has exactly one current verdict.
   */
  upsertCase(fraudCase: FraudCase): Promise<FraudCase>;

  findCase(orderId: string): Promise<FraudCase | null>;

  /** The review queue — cases a human still has to look at. */
  listCasesForReview(): Promise<FraudCase[]>;

  /** Every assessment, for the fraud dashboard. */
  listAllCases(): Promise<FraudCase[]>;

  updateDecision(
    orderId: string,
    decision: FraudDecision,
    reviewedBy: string | undefined,
    reviewedAt: string,
  ): Promise<FraudCase | null>;

  /**
   * Counts by decision.
   *
   * Derived from the stored cases rather than from three counters held
   * alongside them. The old `stats` object drifted from reality the moment a
   * case was re-decided — updateCase changed a verdict without touching the
   * tallies — and reset to zero on every restart.
   */
  countByDecision(): Promise<FraudStats>;
}
