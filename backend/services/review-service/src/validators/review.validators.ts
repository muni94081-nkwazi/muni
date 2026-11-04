import { z } from 'zod';

const rating = z.coerce.number().int().min(1, 'Rating must be 1-5').max(5, 'Rating must be 1-5');

export const createReviewSchema = z.object({
  productId: z.string().trim().min(1, 'productId is required'),
  variantId: z.string().trim().optional(),
  // Lets a buyer who bought the same item twice say which purchase this is about.
  orderId: z.string().trim().optional(),
  rating,
  title: z.string().trim().max(160).optional(),
  body: z.string().trim().min(10, 'Tell other buyers a little more — at least 10 characters').max(5000),
  language: z.string().trim().min(2).max(10).optional(),
});

export const updateReviewSchema = z
  .object({
    rating: rating.optional(),
    title: z.string().trim().max(160).optional(),
    body: z.string().trim().min(10).max(5000).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Provide at least one field to update' });

export const listReviewsSchema = z.object({
  productId: z.string().trim().optional(),
  userId: z.string().trim().optional(),
  sellerId: z.string().trim().optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  verifiedOnly: z.coerce.boolean().optional(),
  withMediaOnly: z.coerce.boolean().optional(),
  sort: z.enum(['recent', 'helpful', 'rating_high', 'rating_low']).default('recent'),
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(20),
});

export const voteSchema = z.object({
  vote: z.enum(['HELPFUL', 'NOT_HELPFUL']).default('HELPFUL'),
});

export const reportSchema = z.object({
  reason: z.enum(['SPAM', 'OFFENSIVE', 'IRRELEVANT', 'FAKE', 'PERSONAL_INFO', 'OTHER']),
  note: z.string().trim().max(1000).optional(),
});

export const respondSchema = z.object({
  response: z.string().trim().min(1).max(2000),
});

export const moderateSchema = z.object({
  status: z.enum(['PUBLISHED', 'PENDING', 'REJECTED']),
  note: z.string().trim().max(1000).optional(),
});

export const uploadMediaSchema = z.object({
  type: z.enum(['IMAGE', 'VIDEO']).default('IMAGE'),
  url: z.string().trim().url('A valid media URL is required'),
  thumbnailUrl: z.string().trim().url().optional(),
});

export const moderateMediaSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
});

export const eligibilitySchema = z.object({
  productId: z.string().trim().min(1, 'productId is required'),
});

export type ListReviewsQuery = z.infer<typeof listReviewsSchema>;
export type EligibilityQuery = z.infer<typeof eligibilitySchema>;
