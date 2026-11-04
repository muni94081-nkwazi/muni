import asyncHandler from '../utils/asyncHandler.js';
import { parsedQuery } from '../middleware/validate.js';
import * as reviewService from '../services/review.service.js';
import * as ratingSummary from '../services/rating-summary.service.js';
import type { EligibilityQuery, ListReviewsQuery } from '../validators/review.validators.js';

export const list = asyncHandler(async (req, res) => {
  const q = parsedQuery<ListReviewsQuery>(req);
  const result = await reviewService.list({
    productId: q.productId,
    userId: q.userId,
    sellerId: q.sellerId,
    rating: q.rating,
    verifiedOnly: q.verifiedOnly,
    withMediaOnly: q.withMediaOnly,
    sort: q.sort,
    page: q.page,
    perPage: q.per_page,
  });
  res.json({ success: true, ...result });
});

export const getById = asyncHandler(async (req, res) => {
  const review = await reviewService.getById(req.params.id, req.actor?.role === 'ADMIN');
  res.json({ success: true, data: review });
});

export const create = asyncHandler(async (req, res) => {
  const review = await reviewService.create(req.actor!, req.body);
  res.status(201).json({ success: true, data: review });
});

export const update = asyncHandler(async (req, res) => {
  const review = await reviewService.update(req.actor!, req.params.id, req.body);
  res.json({ success: true, data: review });
});

export const remove = asyncHandler(async (req, res) => {
  await reviewService.remove(req.actor!, req.params.id);
  res.status(204).send();
});

export const vote = asyncHandler(async (req, res) => {
  const review = await reviewService.vote(req.actor!, req.params.id, req.body.vote);
  res.json({ success: true, data: review });
});

export const withdrawVote = asyncHandler(async (req, res) => {
  const review = await reviewService.withdrawVote(req.actor!, req.params.id);
  res.json({ success: true, data: review });
});

export const report = asyncHandler(async (req, res) => {
  const review = await reviewService.report(req.actor!, req.params.id, req.body.reason, req.body.note);
  res.status(202).json({ success: true, data: { id: review.id, reportCount: review.reportCount } });
});

export const respond = asyncHandler(async (req, res) => {
  const review = await reviewService.respond(req.actor!, req.params.id, req.body.response);
  res.json({ success: true, data: review });
});

export const eligibility = asyncHandler(async (req, res) => {
  const q = parsedQuery<EligibilityQuery>(req);
  const result = await reviewService.checkEligibility(req.actor!.id, q.productId);
  res.json({ success: true, data: result });
});

export const summary = asyncHandler(async (req, res) => {
  const data = await ratingSummary.get(req.params.productId);
  res.json({ success: true, data });
});

// ─── Admin ──────────────────────────────────────────────────────────────────

export const adminList = asyncHandler(async (req, res) => {
  const q = parsedQuery<ListReviewsQuery>(req);
  const result = await reviewService.list({
    productId: q.productId,
    userId: q.userId,
    sellerId: q.sellerId,
    rating: q.rating,
    sort: q.sort,
    page: q.page,
    perPage: q.per_page,
    includeUnpublished: true,
  });
  res.json({ success: true, ...result });
});

export const moderate = asyncHandler(async (req, res) => {
  const review = await reviewService.moderate(req.actor!, req.params.id, req.body.status, req.body.note);
  res.json({ success: true, data: review });
});
