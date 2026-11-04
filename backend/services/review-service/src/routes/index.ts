import { Router } from 'express';
import prisma from '../config/prisma.js';
import { requireActor, requireRole } from '../middleware/identity.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import * as reviewController from '../controllers/review.controller.js';
import * as mediaController from '../controllers/media.controller.js';
import {
  createReviewSchema,
  updateReviewSchema,
  listReviewsSchema,
  voteSchema,
  reportSchema,
  respondSchema,
  moderateSchema,
  uploadMediaSchema,
  moderateMediaSchema,
  eligibilitySchema,
} from '../validators/review.validators.js';

// ─── Health probes ──────────────────────────────────────────────────────────
// At the root, not under /api/v1: the container HEALTHCHECK and k8s probes
// address this service directly, without going through the gateway.
export const healthRoutes = Router();

healthRoutes.get('/health/live', (_req, res) => {
  res.json({ service: 'review-service', status: 'up', ts: new Date().toISOString() });
});

healthRoutes.get('/health/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ service: 'review-service', ready: true, db: 'up', ts: new Date().toISOString() });
  } catch {
    res.status(503).json({ service: 'review-service', ready: false, db: 'down', ts: new Date().toISOString() });
  }
});

healthRoutes.get('/health', (_req, res) => res.json({ status: 'ok', service: 'review-service' }));

// ─── API ────────────────────────────────────────────────────────────────────
// Mounted under /api/v1 by app.ts, matching the prefix api-gateway forwards
// unchanged (see api-gateway/src/utils/proxy.ts).
export const apiRoutes = Router();

// Reading reviews is public — a product page must render them to a signed-out
// visitor. Every write below requires an identified actor.
apiRoutes.get('/reviews', validateQuery(listReviewsSchema), reviewController.list);

// Registered before /reviews/:id so "eligibility" isn't captured as an id.
apiRoutes.get(
  '/reviews/eligibility',
  requireActor,
  validateQuery(eligibilitySchema),
  reviewController.eligibility,
);

apiRoutes.get('/reviews/:id', reviewController.getById);
apiRoutes.get('/reviews/:id/media', mediaController.listForReview);

apiRoutes.post('/reviews', requireActor, validateBody(createReviewSchema), reviewController.create);
apiRoutes.patch('/reviews/:id', requireActor, validateBody(updateReviewSchema), reviewController.update);
apiRoutes.delete('/reviews/:id', requireActor, reviewController.remove);

apiRoutes.post('/reviews/:id/helpful', requireActor, validateBody(voteSchema), reviewController.vote);
apiRoutes.delete('/reviews/:id/helpful', requireActor, reviewController.withdrawVote);

apiRoutes.post('/reviews/:id/report', requireActor, validateBody(reportSchema), reviewController.report);
apiRoutes.post('/reviews/:id/media', requireActor, validateBody(uploadMediaSchema), mediaController.upload);
apiRoutes.delete('/reviews/:id/media/:mediaId', requireActor, mediaController.remove);

// Seller reply — the service checks the caller is the seller this review is about.
apiRoutes.post(
  '/reviews/:id/response',
  requireActor,
  validateBody(respondSchema),
  reviewController.respond,
);

// Star histogram + average for a product page, without scanning the reviews table.
apiRoutes.get('/products/:productId/rating-summary', reviewController.summary);

// ─── Admin ──────────────────────────────────────────────────────────────────
// The gateway already gates /api/v1/admin on ROLE_ADMIN; requireRole here
// keeps the service safe when called directly on the internal network.
apiRoutes.get(
  '/admin/reviews',
  requireRole('ADMIN'),
  validateQuery(listReviewsSchema),
  reviewController.adminList,
);
apiRoutes.patch(
  '/admin/reviews/:id/moderate',
  requireRole('ADMIN'),
  validateBody(moderateSchema),
  reviewController.moderate,
);
apiRoutes.get('/admin/review-media/pending', requireRole('ADMIN'), mediaController.listPending);
apiRoutes.patch(
  '/admin/review-media/:mediaId/moderate',
  requireRole('ADMIN'),
  validateBody(moderateMediaSchema),
  mediaController.moderate,
);

export default apiRoutes;
