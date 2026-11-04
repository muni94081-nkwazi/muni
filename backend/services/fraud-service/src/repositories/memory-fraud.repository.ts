import type { FraudCase, FraudDecision, FraudStats, IFraudRepository } from '../types/repositories.js';

// ─── In-memory fraud repository ───────────────────────────────────────────────
//
// For tests, and for running without a database.

export class MemoryFraudRepository implements IFraudRepository {
  private readonly cases = new Map<string, FraudCase>();

  clear(): void {
    this.cases.clear();
  }

  async upsertCase(c: FraudCase): Promise<FraudCase> {
    const existing = this.cases.get(c.orderId);

    // Re-scoring keeps the original createdAt, as the upsert does.
    const stored: FraudCase = existing
      ? { ...existing, score: c.score, decision: c.decision, triggeredRules: c.triggeredRules, updatedAt: c.updatedAt }
      : structuredClone(c);

    this.cases.set(c.orderId, stored);
    return structuredClone(stored);
  }

  async findCase(orderId: string): Promise<FraudCase | null> {
    const found = this.cases.get(orderId);
    return found ? structuredClone(found) : null;
  }

  async listCasesForReview(): Promise<FraudCase[]> {
    return [...this.cases.values()]
      .filter((c) => c.decision === 'REVIEW')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((c) => structuredClone(c));
  }

  async listAllCases(): Promise<FraudCase[]> {
    return [...this.cases.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((c) => structuredClone(c));
  }

  async updateDecision(
    orderId: string,
    decision: FraudDecision,
    reviewedBy: string | undefined,
    reviewedAt: string,
  ): Promise<FraudCase | null> {
    const current = this.cases.get(orderId);
    if (!current) return null;

    current.decision = decision;
    current.reviewedBy = reviewedBy;
    current.reviewedAt = reviewedAt;
    current.updatedAt = reviewedAt;

    return structuredClone(current);
  }

  async countByDecision(): Promise<FraudStats> {
    const stats: FraudStats = { allowed: 0, reviewed: 0, blocked: 0 };

    for (const c of this.cases.values()) {
      if (c.decision === 'ALLOW') stats.allowed += 1;
      if (c.decision === 'REVIEW') stats.reviewed += 1;
      if (c.decision === 'BLOCK') stats.blocked += 1;
    }

    return stats;
  }
}
