import { purchaseEvents } from '../store/event-store.js';
import type { AssociationRule } from '../models/recommendation.model.js';

// ─── Item-to-Item Similarity & Association Rule Mining ─────────────────────────
//
// Two related but distinct pieces of math, both driven off the same purchase log:
//
//  1. Cosine similarity over the binary user-item purchase matrix — powers
//     "Customers who bought this also bought" (getSimilarProducts).
//  2. Market-basket association rules (support/confidence/lift) over orders —
//     powers "Frequently Bought Together" bundle selection + discount sizing.

export interface SimilarityScore {
  productId: string;
  score: number; // cosine similarity, 0..1
}

class ItemSimilarityService {
  /** productId -> set of userIds who purchased it. */
  private buildProductUserIndex(): Map<string, Set<string>> {
    const index = new Map<string, Set<string>>();
    for (const p of purchaseEvents) {
      if (!index.has(p.productId)) index.set(p.productId, new Set());
      index.get(p.productId)!.add(p.userId);
    }
    return index;
  }

  /** orderId -> set of productIds purchased together in that order. */
  private buildOrderIndex(): Map<string, Set<string>> {
    const index = new Map<string, Set<string>>();
    for (const p of purchaseEvents) {
      if (!index.has(p.orderId)) index.set(p.orderId, new Set());
      index.get(p.orderId)!.add(p.productId);
    }
    return index;
  }

  /**
   * Item-item cosine similarity: sim(i,j) = |U_i ∩ U_j| / sqrt(|U_i| * |U_j|)
   * where U_x is the set of users who purchased product x.
   * This is the row of the full item-to-item similarity matrix for `productId`,
   * computed on demand rather than materializing the whole N×N matrix up front.
   */
  getSimilarProducts(productId: string, limit = 6): SimilarityScore[] {
    const index = this.buildProductUserIndex();
    const targetUsers = index.get(productId);
    if (!targetUsers || targetUsers.size === 0) return [];

    const scores: SimilarityScore[] = [];
    for (const [pid, users] of index) {
      if (pid === productId) continue;
      let intersection = 0;
      for (const u of users) if (targetUsers.has(u)) intersection++;
      if (intersection === 0) continue;

      const score = intersection / Math.sqrt(targetUsers.size * users.size);
      scores.push({ productId: pid, score: Math.round(score * 1000) / 1000 });
    }

    return scores.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /**
   * Association rules for `productId` -> other products co-purchased in the same order.
   *   support(A,B)    = orders containing both / total orders
   *   confidence(A->B) = orders containing both / orders containing A
   *   lift(A->B)       = confidence(A->B) / support(B)
   * Sorted by confidence — the items most reliably bought alongside `productId`.
   */
  getAssociationRules(productId: string, topN = 2): AssociationRule[] {
    const orderIndex = this.buildOrderIndex();
    const totalOrders = orderIndex.size;
    if (totalOrders === 0) return [];

    const ordersWithA = [...orderIndex.values()].filter((items) => items.has(productId));
    if (ordersWithA.length === 0) return [];

    const coCounts = new Map<string, number>();
    for (const items of ordersWithA) {
      for (const pid of items) {
        if (pid === productId) continue;
        coCounts.set(pid, (coCounts.get(pid) ?? 0) + 1);
      }
    }

    const orderCountByProduct = new Map<string, number>();
    for (const items of orderIndex.values()) {
      for (const pid of items) orderCountByProduct.set(pid, (orderCountByProduct.get(pid) ?? 0) + 1);
    }

    const rules: AssociationRule[] = [...coCounts.entries()].map(([pid, coOccurrences]) => {
      const confidence = coOccurrences / ordersWithA.length;
      const support = coOccurrences / totalOrders;
      const supportB = (orderCountByProduct.get(pid) ?? 0) / totalOrders;
      const lift = supportB > 0 ? confidence / supportB : 0;
      return { productId: pid, coOccurrences, support, confidence, lift };
    });

    return rules.sort((a, b) => b.confidence - a.confidence).slice(0, topN);
  }
}

export const itemSimilarityService = new ItemSimilarityService();

/**
 * Auto-calculate the bundle discount from how confidently the items are
 * bought together. Stronger associations (customers reliably buy the set
 * anyway) get a smaller nudge; weaker/no-data pairings get a bigger one to
 * incentivize the cross-sell.
 */
export function computeBundleDiscountPercent(avgConfidence: number): number {
  if (avgConfidence >= 0.6) return 15;
  if (avgConfidence >= 0.3) return 10;
  return 5;
}
