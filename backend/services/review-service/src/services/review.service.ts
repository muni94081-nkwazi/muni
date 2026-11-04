import type { Prisma, Review, ReviewStatus } from '../generated/prisma/index.js';
import prisma from '../config/prisma.js';
import env from '../config/env.js';
import ApiError from '../utils/ApiError.js';
import logger from '../config/logger.js';
import { getPurchaseEvidence } from './purchase.service.js';
import * as ratingSummary from './rating-summary.service.js';
import { publishReviewEvent } from '../events/publisher.js';

// ─── Reviews ────────────────────────────────────────────────────────────────
//
// Two properties this module is responsible for and the previous in-memory
// implementation had neither of:
//
//   * `isVerifiedPurchase` is derived from order history, never accepted from
//     the request body. A client used to be able to POST `verified: true`.
//   * The rating summary is kept consistent with the reviews table inside the
//     same transaction as every write that changes it.

export type ReviewSort = 'recent' | 'helpful' | 'rating_high' | 'rating_low';

export interface ListParams {
  productId?: string;
  userId?: string;
  sellerId?: string;
  rating?: number;
  verifiedOnly?: boolean;
  withMediaOnly?: boolean;
  sort?: ReviewSort;
  page: number;
  perPage: number;
  /** Admin listings may include unpublished rows; public listings never do. */
  includeUnpublished?: boolean;
}

const SORT_ORDERS: Record<ReviewSort, Prisma.ReviewOrderByWithRelationInput[]> = {
  recent: [{ createdAt: 'desc' }],
  // Ties on helpfulness fall back to recency, otherwise pagination is unstable.
  helpful: [{ helpfulCount: 'desc' }, { createdAt: 'desc' }],
  rating_high: [{ rating: 'desc' }, { createdAt: 'desc' }],
  rating_low: [{ rating: 'asc' }, { createdAt: 'desc' }],
};

export async function list(params: ListParams) {
  const where: Prisma.ReviewWhereInput = {
    deletedAt: null,
    ...(params.includeUnpublished ? {} : { status: 'PUBLISHED' }),
    ...(params.productId ? { productId: params.productId } : {}),
    ...(params.userId ? { userId: params.userId } : {}),
    ...(params.sellerId ? { sellerId: params.sellerId } : {}),
    ...(params.rating ? { rating: params.rating } : {}),
    ...(params.verifiedOnly ? { isVerifiedPurchase: true } : {}),
    ...(params.withMediaOnly ? { media: { some: { status: 'APPROVED' } } } : {}),
  };

  const [data, total] = await Promise.all([
    prisma.review.findMany({
      where,
      orderBy: SORT_ORDERS[params.sort ?? 'recent'],
      skip: (params.page - 1) * params.perPage,
      take: params.perPage,
      include: { media: { where: { status: 'APPROVED' } } },
    }),
    prisma.review.count({ where }),
  ]);

  // The average is read from the summary rather than derived from this page —
  // averaging the current page would report a different number per page.
  const summary = params.productId ? await ratingSummary.get(params.productId) : null;

  return {
    data,
    meta: {
      current_page: params.page,
      per_page: params.perPage,
      total,
      last_page: Math.max(1, Math.ceil(total / params.perPage)),
      summary,
    },
  };
}

export async function getById(id: string, includeUnpublished = false): Promise<Review> {
  const review = await prisma.review.findFirst({
    where: {
      id,
      deletedAt: null,
      ...(includeUnpublished ? {} : { status: 'PUBLISHED' }),
    },
    include: { media: { where: { status: 'APPROVED' } } },
  });
  if (!review) throw ApiError.notFound('Review not found');
  return review;
}

export interface CreateInput {
  productId: string;
  variantId?: string;
  rating: number;
  title?: string;
  body: string;
  language?: string;
  /** Optional: pin the review to one of several qualifying purchases. */
  orderId?: string;
}

export interface Actor {
  id: string;
  name?: string;
  role: string;
}

/**
 * Creates a review, refusing anyone who cannot show a qualifying purchase.
 *
 * `isVerifiedPurchase` is set from the evidence, not the request. When
 * REVIEW_REQUIRE_VERIFIED_PURCHASE is off (seed/demo environments) a review
 * without evidence is still accepted, but it is recorded as unverified — the
 * badge always means what it says.
 */
export async function create(actor: Actor, input: CreateInput): Promise<Review> {
  const evidence = await getPurchaseEvidence(actor.id, input.productId);

  if (!evidence.eligible && env.review.requireVerifiedPurchase) {
    throw ApiError.forbidden(evidence.reason ?? 'Only verified buyers can review this item.');
  }

  // When several purchases qualify, the caller may name one; otherwise take
  // the most recent. The order id is part of the uniqueness key, so this is
  // also what decides whether they are reviewing a new purchase or repeating
  // one they already reviewed.
  const purchase = input.orderId
    ? evidence.purchases.find((p) => p.orderId === input.orderId)
    : evidence.purchases[0];

  if (input.orderId && !purchase) {
    throw ApiError.badRequest('That order does not contain this item, or is not eligible for review.');
  }

  // Without verification enforcement there may be no purchase row at all; the
  // synthetic id keeps the unique constraint meaningful (one review per buyer
  // per product) instead of nullable.
  const orderId = purchase?.orderId ?? `unverified:${actor.id}:${input.productId}`;

  const existing = await prisma.review.findUnique({
    where: {
      userId_productId_orderId: { userId: actor.id, productId: input.productId, orderId },
    },
  });
  if (existing && !existing.deletedAt) {
    throw ApiError.conflict('You have already reviewed this purchase.');
  }

  const review = await prisma.$transaction(async (tx) => {
    const created = existing
      ? // Re-reviewing after a soft delete reuses the row so the unique
        // constraint still holds.
        await tx.review.update({
          where: { id: existing.id },
          data: {
            rating: input.rating,
            title: input.title ?? null,
            body: input.body,
            language: input.language ?? 'en',
            status: env.review.defaultStatus,
            isVerifiedPurchase: purchase?.status === 'DELIVERED',
            deletedAt: null,
            helpfulCount: 0,
            notHelpfulCount: 0,
            reportCount: 0,
          },
        })
      : await tx.review.create({
          data: {
            productId: input.productId,
            variantId: input.variantId ?? purchase?.variantId ?? null,
            sellerId: purchase?.sellerId ?? null,
            userId: actor.id,
            userName: actor.name ?? 'MUNI buyer',
            orderId,
            subOrderId: purchase?.subOrderId ?? null,
            rating: input.rating,
            title: input.title ?? null,
            body: input.body,
            language: input.language ?? 'en',
            status: env.review.defaultStatus,
            isVerifiedPurchase: purchase?.status === 'DELIVERED',
          },
        });

    await ratingSummary.recompute(input.productId, tx);
    return created;
  });

  void publishReviewEvent('review.created', {
    reviewId: review.id,
    productId: review.productId,
    sellerId: review.sellerId,
    userId: review.userId,
    rating: review.rating,
    isVerifiedPurchase: review.isVerifiedPurchase,
    status: review.status,
  });

  return review;
}

export interface UpdateInput {
  rating?: number;
  title?: string;
  body?: string;
}

export async function update(actor: Actor, id: string, input: UpdateInput): Promise<Review> {
  const review = await prisma.review.findFirst({ where: { id, deletedAt: null } });
  if (!review) throw ApiError.notFound('Review not found');
  if (review.userId !== actor.id) throw ApiError.forbidden('You can only edit your own review.');

  const ageHours = (Date.now() - review.createdAt.getTime()) / 3_600_000;
  if (ageHours > env.review.editWindowHours) {
    throw ApiError.forbidden(
      `Reviews can only be edited within ${env.review.editWindowHours} hours of posting.`,
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.review.update({
      where: { id },
      data: {
        rating: input.rating ?? undefined,
        title: input.title ?? undefined,
        body: input.body ?? undefined,
      },
    });
    // Only a rating change moves the summary, but recompute is cheap and
    // unconditional here so no future edit path can forget it.
    await ratingSummary.recompute(review.productId, tx);
    return next;
  });

  void publishReviewEvent('review.updated', {
    reviewId: updated.id,
    productId: updated.productId,
    rating: updated.rating,
  });

  return updated;
}

export async function remove(actor: Actor, id: string): Promise<void> {
  const review = await prisma.review.findFirst({ where: { id, deletedAt: null } });
  if (!review) throw ApiError.notFound('Review not found');

  const isOwner = review.userId === actor.id;
  const isAdmin = actor.role === 'ADMIN';
  if (!isOwner && !isAdmin) throw ApiError.forbidden('You can only delete your own review.');

  await prisma.$transaction(async (tx) => {
    // Soft delete: a dispute or a counterfeit investigation months later still
    // needs to see what the buyer originally said.
    await tx.review.update({ where: { id }, data: { deletedAt: new Date() } });
    await ratingSummary.recompute(review.productId, tx);
  });

  void publishReviewEvent('review.deleted', {
    reviewId: id,
    productId: review.productId,
    deletedBy: actor.id,
  });
}

// ─── Helpfulness ────────────────────────────────────────────────────────────

export async function vote(actor: Actor, id: string, voteType: 'HELPFUL' | 'NOT_HELPFUL') {
  const review = await prisma.review.findFirst({ where: { id, deletedAt: null } });
  if (!review) throw ApiError.notFound('Review not found');
  if (review.userId === actor.id) {
    throw ApiError.badRequest('You cannot vote on your own review.');
  }

  return prisma.$transaction(async (tx) => {
    // Upsert rather than create: changing your mind flips the vote instead of
    // being rejected as a duplicate.
    await tx.reviewVote.upsert({
      where: { reviewId_userId: { reviewId: id, userId: actor.id } },
      create: { reviewId: id, userId: actor.id, vote: voteType },
      update: { vote: voteType },
    });

    // Recount from the vote rows in the same transaction; incrementing a
    // counter would drift the moment a vote is changed or withdrawn.
    const [helpfulCount, notHelpfulCount] = await Promise.all([
      tx.reviewVote.count({ where: { reviewId: id, vote: 'HELPFUL' } }),
      tx.reviewVote.count({ where: { reviewId: id, vote: 'NOT_HELPFUL' } }),
    ]);

    return tx.review.update({ where: { id }, data: { helpfulCount, notHelpfulCount } });
  });
}

export async function withdrawVote(actor: Actor, id: string) {
  return prisma.$transaction(async (tx) => {
    await tx.reviewVote.deleteMany({ where: { reviewId: id, userId: actor.id } });
    const [helpfulCount, notHelpfulCount] = await Promise.all([
      tx.reviewVote.count({ where: { reviewId: id, vote: 'HELPFUL' } }),
      tx.reviewVote.count({ where: { reviewId: id, vote: 'NOT_HELPFUL' } }),
    ]);
    return tx.review.update({ where: { id }, data: { helpfulCount, notHelpfulCount } });
  });
}

// ─── Reporting & moderation ─────────────────────────────────────────────────

export async function report(actor: Actor, id: string, reason: string, note?: string) {
  const review = await prisma.review.findFirst({ where: { id, deletedAt: null } });
  if (!review) throw ApiError.notFound('Review not found');

  const result = await prisma.$transaction(async (tx) => {
    await tx.reviewReport.upsert({
      where: { reviewId_reporterId: { reviewId: id, reporterId: actor.id } },
      create: { reviewId: id, reporterId: actor.id, reason, note: note ?? null },
      update: { reason, note: note ?? null },
    });

    const reportCount = await tx.reviewReport.count({ where: { reviewId: id, status: 'OPEN' } });

    // Enough independent reports pulls the review pending a human decision.
    // This hides it from the product page but does not judge it — an admin
    // still has to uphold or dismiss.
    const shouldHide =
      reportCount >= env.review.autoHideReportThreshold && review.status === 'PUBLISHED';

    const updated = await tx.review.update({
      where: { id },
      data: { reportCount, ...(shouldHide ? { status: 'PENDING' as ReviewStatus } : {}) },
    });

    if (shouldHide) await ratingSummary.recompute(review.productId, tx);

    return { updated, shouldHide, reportCount };
  });

  if (result.shouldHide) {
    logger.warn('review auto-hidden after reaching the report threshold', {
      reviewId: id,
      reportCount: result.reportCount,
    });
    void publishReviewEvent('review.auto_hidden', {
      reviewId: id,
      productId: review.productId,
      reportCount: result.reportCount,
    });
  }

  return result.updated;
}

export async function moderate(
  actor: Actor,
  id: string,
  status: ReviewStatus,
  note?: string,
): Promise<Review> {
  const review = await prisma.review.findUnique({ where: { id } });
  if (!review) throw ApiError.notFound('Review not found');

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.review.update({
      where: { id },
      data: {
        status,
        moderatedBy: actor.id,
        moderationNote: note ?? null,
        moderatedAt: new Date(),
        // Deciding on a review closes the reports that raised it.
        reports: { updateMany: { where: { status: 'OPEN' }, data: { status: status === 'REJECTED' ? 'UPHELD' : 'DISMISSED', resolvedBy: actor.id, resolvedAt: new Date() } } },
      },
    });
    await ratingSummary.recompute(review.productId, tx);
    return next;
  });

  void publishReviewEvent('review.moderated', {
    reviewId: id,
    productId: review.productId,
    status,
    moderatedBy: actor.id,
  });

  return updated;
}

/** Seller's public reply. Only the seller the review is about may answer it. */
export async function respond(actor: Actor, id: string, response: string): Promise<Review> {
  const review = await prisma.review.findFirst({ where: { id, deletedAt: null } });
  if (!review) throw ApiError.notFound('Review not found');

  if (actor.role !== 'ADMIN' && review.sellerId !== actor.id) {
    throw ApiError.forbidden('Only the seller of this item can respond to its reviews.');
  }

  const updated = await prisma.review.update({
    where: { id },
    data: { sellerResponse: response, sellerRespondedAt: new Date() },
  });

  void publishReviewEvent('review.seller_responded', {
    reviewId: id,
    productId: review.productId,
    sellerId: review.sellerId,
  });

  return updated;
}

/** Powers the "Write a review" affordance: may this buyer review this product? */
export async function checkEligibility(userId: string, productId: string) {
  const evidence = await getPurchaseEvidence(userId, productId);

  const alreadyReviewed = await prisma.review.findMany({
    where: { userId, productId, deletedAt: null },
    select: { id: true, orderId: true, rating: true, createdAt: true },
  });

  const reviewedOrderIds = new Set(alreadyReviewed.map((r) => r.orderId));
  const reviewablePurchases = evidence.purchases.filter((p) => !reviewedOrderIds.has(p.orderId));

  return {
    eligible: evidence.eligible && reviewablePurchases.length > 0,
    reason:
      evidence.eligible && reviewablePurchases.length === 0
        ? 'You have already reviewed this purchase.'
        : evidence.reason,
    reviewablePurchases: reviewablePurchases.map((p) => ({
      orderId: p.orderId,
      subOrderId: p.subOrderId,
      deliveredAt: p.deliveredAt,
      status: p.status,
    })),
    existingReviews: alreadyReviewed,
  };
}
