import type { MediaStatus, MediaType, ReviewMedia } from '../generated/prisma/index.js';
import prisma from '../config/prisma.js';
import env from '../config/env.js';
import ApiError from '../utils/ApiError.js';

// Photo/video attachments on a review. Previously an in-process Map, so
// uploads vanished on restart and the admin moderation queue
// (ReviewMediaModerationPage in the admin panel) had nothing durable to act on.
//
// Media defaults to PENDING: an image is the one part of a review that can
// carry content no text filter would catch, and unlike the review body it is
// shown before anyone reads it.

export async function upload(
  actorId: string,
  reviewId: string,
  type: MediaType,
  url: string,
  thumbnailUrl?: string,
): Promise<ReviewMedia> {
  const review = await prisma.review.findFirst({ where: { id: reviewId, deletedAt: null } });
  if (!review) throw ApiError.notFound('Review not found');
  if (review.userId !== actorId) {
    throw ApiError.forbidden('You can only attach media to your own review.');
  }

  const existing = await prisma.reviewMedia.count({ where: { reviewId } });
  if (existing >= env.review.maxMediaPerReview) {
    throw ApiError.badRequest(`A review can have at most ${env.review.maxMediaPerReview} attachments.`);
  }

  return prisma.reviewMedia.create({
    data: { reviewId, type, url, thumbnailUrl: thumbnailUrl ?? url },
  });
}

/** Public reads see approved media only; the owner and admins see their own pending items. */
export async function listForReview(reviewId: string, includePending = false): Promise<ReviewMedia[]> {
  return prisma.reviewMedia.findMany({
    where: { reviewId, ...(includePending ? {} : { status: 'APPROVED' }) },
    orderBy: { createdAt: 'asc' },
  });
}

export async function remove(actorId: string, actorRole: string, mediaId: string): Promise<void> {
  const media = await prisma.reviewMedia.findUnique({
    where: { id: mediaId },
    include: { review: true },
  });
  if (!media) throw ApiError.notFound('Media not found');

  if (actorRole !== 'ADMIN' && media.review.userId !== actorId) {
    throw ApiError.forbidden('You can only remove media from your own review.');
  }

  await prisma.reviewMedia.delete({ where: { id: mediaId } });
}

/** Admin moderation queue — the backlog ReviewMediaModerationPage renders. */
export async function listPending(page = 1, perPage = 50) {
  const [data, total] = await Promise.all([
    prisma.reviewMedia.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      skip: (page - 1) * perPage,
      take: perPage,
      include: { review: { select: { id: true, productId: true, userId: true, body: true } } },
    }),
    prisma.reviewMedia.count({ where: { status: 'PENDING' } }),
  ]);

  return {
    data,
    meta: { current_page: page, per_page: perPage, total, last_page: Math.max(1, Math.ceil(total / perPage)) },
  };
}

export async function moderate(
  actorId: string,
  mediaId: string,
  status: MediaStatus,
): Promise<ReviewMedia> {
  const media = await prisma.reviewMedia.findUnique({ where: { id: mediaId } });
  if (!media) throw ApiError.notFound('Media not found');

  return prisma.reviewMedia.update({
    where: { id: mediaId },
    data: { status, moderatedBy: actorId, moderatedAt: new Date() },
  });
}
