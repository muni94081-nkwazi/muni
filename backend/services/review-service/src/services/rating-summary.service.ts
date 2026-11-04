import type { Prisma, ProductRatingSummary } from '../generated/prisma/index.js';
import prisma from '../config/prisma.js';

// ─── Rating summary ─────────────────────────────────────────────────────────
//
// A product page needs the average, the review count and the star histogram on
// every render. Computing those from the reviews table each time is a scan per
// render; keeping a denormalised row makes it a primary-key read.
//
// The summary is rebuilt from the reviews table (rather than incremented) on
// every change. A rebuild is one indexed GROUP BY over a single product's
// published reviews — cheap — and it cannot drift the way running counters do
// when an event is missed or replayed.

type Tx = Prisma.TransactionClient;

export async function recompute(productId: string, tx: Tx = prisma): Promise<ProductRatingSummary> {
  const grouped = await tx.review.groupBy({
    by: ['rating'],
    where: { productId, status: 'PUBLISHED', deletedAt: null },
    _count: { _all: true },
  });

  const verifiedReviews = await tx.review.count({
    where: { productId, status: 'PUBLISHED', deletedAt: null, isVerifiedPurchase: true },
  });

  const counts = [0, 0, 0, 0, 0]; // index 0 → 1 star … index 4 → 5 stars
  let total = 0;
  let weighted = 0;

  for (const row of grouped) {
    const n = row._count._all;
    const star = Math.min(5, Math.max(1, row.rating));
    counts[star - 1] += n;
    total += n;
    weighted += star * n;
  }

  const averageRating = total > 0 ? Math.round((weighted / total) * 100) / 100 : 0;

  const data = {
    totalReviews: total,
    averageRating,
    count1: counts[0],
    count2: counts[1],
    count3: counts[2],
    count4: counts[3],
    count5: counts[4],
    verifiedReviews,
  };

  return tx.productRatingSummary.upsert({
    where: { productId },
    create: { productId, ...data },
    update: data,
  });
}

export async function get(productId: string): Promise<ProductRatingSummary> {
  const existing = await prisma.productRatingSummary.findUnique({ where: { productId } });
  if (existing) return existing;

  // A product nobody has reviewed has no row yet. Recompute rather than
  // returning a literal so a product whose reviews predate this table (or
  // whose summary was never written) still reports the truth.
  return recompute(productId);
}

/** Bulk read for listing pages — one query for a whole page of products. */
export async function getMany(productIds: string[]): Promise<Map<string, ProductRatingSummary>> {
  if (productIds.length === 0) return new Map();
  const rows = await prisma.productRatingSummary.findMany({
    where: { productId: { in: productIds } },
  });
  return new Map(rows.map((row) => [row.productId, row]));
}
