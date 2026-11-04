/**
 * review.service.ts — Prisma-backed review service (Phase 7 upgrade)
 *
 * Replaces the in-memory Map implementation. Reviews are persisted in
 * the PostgreSQL `Review` table and product ratings are recalculated
 * using an aggregate query after each write.
 */
import { z } from 'zod';
import { prisma } from '../db/prisma.js';

// ── Schemas ───────────────────────────────────────────────────────────────────

export const CreateReviewSchema = z.object({
  rating:   z.number().int().min(1).max(5),
  title:    z.string().min(2).max(200),
  body:     z.string().min(10).max(5000),
  userName: z.string().min(1).max(100).default('Anonymous'),
});

export type CreateReviewInput = z.infer<typeof CreateReviewSchema>;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * List paginated reviews for a product.
 * Sorted: highest rating first, then newest.
 */
export async function list(productId: string, page = 0, size = 10) {
  const [data, total] = await prisma.$transaction([
    prisma.review.findMany({
      where:   { productId },
      orderBy: [{ rating: 'desc' }, { createdAt: 'desc' }],
      skip:    page * size,
      take:    size,
    }),
    prisma.review.count({ where: { productId } }),
  ]);

  return {
    data,
    meta: {
      current_page: page,
      last_page:    Math.max(0, Math.ceil(total / size) - 1),
      per_page:     size,
      total,
    },
  };
}

/**
 * Add a review and immediately recalculate the product's average rating.
 * One user is allowed only ONE review per product (upsert on userId+productId).
 */
export async function add(
  productId: string,
  userId:    string,
  input:     CreateReviewInput,
) {
  const validated = CreateReviewSchema.parse(input);

  // Upsert: if user already reviewed this product, update it
  const review = await prisma.review.upsert({
    where:  {
      // We need a unique constraint on (productId, userId) in the schema.
      // If it doesn't exist yet, create() is fine — use findFirst + create/update pattern.
      id: (await prisma.review.findFirst({ where: { productId, userId } }))?.id ?? 'new',
    },
    create: {
      productId,
      userId,
      userName:        validated.userName,
      rating:          validated.rating,
      title:           validated.title,
      body:            validated.body,
      verifiedPurchase: false,   // will be set true by order-service event in future
    },
    update: {
      rating:   validated.rating,
      title:    validated.title,
      body:     validated.body,
      userName: validated.userName,
    },
  });

  // Recalculate product averageRating + reviewCount
  await recalculateProductRating(productId);

  return review;
}

/**
 * Mark a review as helpful (+1 helpful count).
 */
export async function markHelpful(reviewId: string) {
  return prisma.review.update({
    where: { id: reviewId },
    data:  { helpful: { increment: 1 } },
  });
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function recalculateProductRating(productId: string): Promise<void> {
  const agg = await prisma.review.aggregate({
    where:  { productId },
    _avg:   { rating: true },
    _count: true,
  });

  await prisma.product.update({
    where: { id: productId },
    data: {
      averageRating: Number((agg._avg.rating ?? 0).toFixed(2)),
      reviewCount:   agg._count,
    },
  });
}
