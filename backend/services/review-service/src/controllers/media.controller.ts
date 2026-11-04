import asyncHandler from '../utils/asyncHandler.js';
import * as mediaService from '../services/review-media.service.js';

export const upload = asyncHandler(async (req, res) => {
  const media = await mediaService.upload(
    req.actor!.id,
    req.params.id,
    req.body.type,
    req.body.url,
    req.body.thumbnailUrl,
  );
  res.status(201).json({ success: true, data: media });
});

export const listForReview = asyncHandler(async (req, res) => {
  const includePending = req.actor?.role === 'ADMIN';
  const media = await mediaService.listForReview(req.params.id, includePending);
  res.json({ success: true, data: media });
});

export const remove = asyncHandler(async (req, res) => {
  await mediaService.remove(req.actor!.id, req.actor!.role, req.params.mediaId);
  res.status(204).send();
});

export const listPending = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const perPage = Math.min(100, Math.max(1, Number(req.query.per_page ?? 50)));
  const result = await mediaService.listPending(page, perPage);
  res.json({ success: true, ...result });
});

export const moderate = asyncHandler(async (req, res) => {
  const media = await mediaService.moderate(req.actor!.id, req.params.mediaId, req.body.status);
  res.json({ success: true, data: media });
});
