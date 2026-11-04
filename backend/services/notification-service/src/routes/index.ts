import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma.js';
import env from '../config/env.js';
import logger from '../config/logger.js';
import * as notificationService from '../services/notification.service.js';
import * as deviceTokens from '../services/device-token.service.js';
import { dispatch, processRetries } from '../services/dispatch.service.js';
import { invalidateContact } from '../clients/user.client.js';
import { configuredProviders } from '../providers/index.js';
import {
  requireAuth,
  requireRole,
  requireInternalCaller,
} from '../../../../shared/http/service-auth.middleware.js';

// ─── Health probes ──────────────────────────────────────────────────────────
export const healthRoutes = Router();

healthRoutes.get('/health/live', (_req, res) => {
  res.json({ service: 'notification-service', status: 'up', ts: new Date().toISOString() });
});

healthRoutes.get('/health/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    // Which channels can actually reach someone right now. A deployment with
    // no configured provider is "ready" but worth surfacing — it is the state
    // this service was permanently in before.
    res.json({
      service: 'notification-service',
      ready: true,
      db: 'up',
      channels: {
        sms: configuredProviders('SMS').map((p) => p.name),
        whatsapp: configuredProviders('WHATSAPP').map((p) => p.name),
        push: configuredProviders('PUSH').map((p) => p.name),
        email: configuredProviders('EMAIL').map((p) => p.name),
      },
      dryRun: env.delivery.dryRun,
      ts: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({ service: 'notification-service', ready: false, db: 'down' });
  }
});

healthRoutes.get('/health', (_req, res) => res.json({ status: 'ok', service: 'notification-service' }));

// ─── API ────────────────────────────────────────────────────────────────────
export const apiRoutes = Router();

// ─── Identity ─────────────────────────────────────────────────────────────────
//
// `actorId` read `x-user-id` straight off the request and `requireActor` did no
// more than check it was non-empty — a header anyone can type. Every route
// below reads or mutates ONE person's notifications: their inbox, their unread
// count, their device push tokens. A hand-written header was enough to read a
// stranger's notifications or unregister their handset.
//
// `requireAuth` from the shared middleware replaces it: with
// INTERNAL_IDENTITY_SECRET set it verifies the gateway's signed assertion, and
// falls back to the stamped header only when the secret is unset, so a dev
// checkout still works. The acting user is then read from `res.locals`, never
// from the request.
const requireActor = requireAuth;

/** The verified caller. Only valid on routes behind `requireActor`. */
function actorId(_req: Request, res: Response): string {
  return res.locals.userId as string;
}

const asyncRoute =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };

const sendSchema = z.object({
  userId: z.string().min(1),
  type: z.string().min(1),
  title: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
  category: z.enum(['TRANSACTIONAL', 'MARKETING']).optional(),
  channels: z.array(z.enum(['IN_APP', 'SMS', 'WHATSAPP', 'PUSH', 'EMAIL'])).optional(),
  data: z.record(z.unknown()).optional(),
  dedupeKey: z.string().optional(),
});

/**
 * Direct send, for services without a Kafka producer. When `title`/`body` are
 * omitted the registered template for `type` renders the message, so callers
 * don't duplicate copy that already exists.
 *
 * Internal callers only, and it had no guard at all. `userId` is a field in the
 * body, so this was "send any message, to any user, over SMS, WhatsApp, push or
 * email" — a phishing primitive delivered from MUNI's own sender identity, and
 * on the customer router (`auth('/notifications')`) any logged-in shopper could
 * reach it.
 *
 * `requireInternalCaller` needs the `svc` claim only a peer service can mint,
 * so a valid customer session is not enough. auth-service's notification client
 * signs one (clients/notification.client.ts).
 */
apiRoutes.post(
  '/notifications/send',
  requireInternalCaller,
  asyncRoute(async (req, res) => {
    const parsed = sendSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: 'Validation failed',
        details: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      });
      return;
    }

    const input = parsed.data;
    const notification = await dispatch({
      userId: input.userId,
      eventType: input.type,
      data: input.data,
      dedupeKey: input.dedupeKey,
      override:
        input.title && input.body
          ? {
              title: input.title,
              body: input.body,
              category: input.category,
              channels: input.channels,
            }
          : undefined,
    });

    if (!notification) {
      res.status(422).json({
        success: false,
        message: `No template registered for "${input.type}" — supply title and body, or add a template.`,
      });
      return;
    }

    res.status(201).json({ success: true, data: notification });
  }),
);

apiRoutes.get(
  '/notifications',
  requireActor,
  asyncRoute(async (req, res) => {
    const result = await notificationService.list({
      userId: actorId(req, res),
      unreadOnly: req.query.unread === 'true',
      page: Math.max(1, Number(req.query.page ?? 1)),
      perPage: Math.min(100, Math.max(1, Number(req.query.per_page ?? 20))),
    });
    res.json({ success: true, ...result });
  }),
);

apiRoutes.get(
  '/notifications/count',
  requireActor,
  asyncRoute(async (req, res) => {
    res.json({ success: true, data: await notificationService.counts(actorId(req, res)) });
  }),
);

apiRoutes.patch(
  '/notifications/read-all',
  requireActor,
  asyncRoute(async (req, res) => {
    const updated = await notificationService.markAllRead(actorId(req, res));
    res.json({ success: true, data: { updated } });
  }),
);

apiRoutes.patch(
  '/notifications/:id/read',
  requireActor,
  asyncRoute(async (req, res) => {
    const notification = await notificationService.markRead(actorId(req, res), req.params.id);
    if (!notification) {
      res.status(404).json({ success: false, message: 'Notification not found' });
      return;
    }
    res.json({ success: true, data: notification });
  }),
);

apiRoutes.delete(
  '/notifications/:id',
  requireActor,
  asyncRoute(async (req, res) => {
    const removed = await notificationService.remove(actorId(req, res), req.params.id);
    if (!removed) {
      res.status(404).json({ success: false, message: 'Notification not found' });
      return;
    }
    res.status(204).send();
  }),
);

/** Why a notification did or didn't arrive — per channel, with the provider verdict. */
apiRoutes.get(
  '/notifications/:id/deliveries',
  requireActor,
  asyncRoute(async (req, res) => {
    const rows = await notificationService.deliveries(actorId(req, res), req.params.id);
    if (rows === null) {
      res.status(404).json({ success: false, message: 'Notification not found' });
      return;
    }
    res.json({ success: true, data: rows });
  }),
);

// ─── Device tokens (push) ───────────────────────────────────────────────────

const deviceSchema = z.object({
  token: z.string().min(10),
  platform: z.enum(['android', 'ios', 'web']).default('android'),
});

apiRoutes.post(
  '/notifications/devices',
  requireActor,
  asyncRoute(async (req, res) => {
    const parsed = deviceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: 'A valid FCM token is required' });
      return;
    }
    const device = await deviceTokens.register(actorId(req, res), parsed.data.token, parsed.data.platform);
    res.status(201).json({ success: true, data: { id: device.id, platform: device.platform } });
  }),
);

apiRoutes.delete(
  '/notifications/devices/:token',
  requireActor,
  asyncRoute(async (req, res) => {
    await deviceTokens.unregister(req.params.token);
    res.status(204).send();
  }),
);

/**
 * Called by user-service when preferences change, so the cache doesn't hold a
 * stale opt-out. Internal only: unguarded, any caller could evict any user's
 * cached contact details on demand.
 */
apiRoutes.post('/notifications/cache/invalidate/:userId', requireInternalCaller, (req, res) => {
  invalidateContact(req.params.userId);
  res.status(204).send();
});

/**
 * Manual retry sweep — useful after restoring a provider outage.
 *
 * Admin only. It is on an `/admin` path and had no role check, so anyone could
 * fire a platform-wide re-send of every retryable notification.
 */
apiRoutes.post(
  '/admin/notifications/retry',
  requireRole('ROLE_ADMIN', 'ROLE_SUPER_ADMIN'),
  asyncRoute(async (_req, res) => {
    const processed = await processRetries();
    logger.info('manual retry sweep triggered', { processed });
    res.json({ success: true, data: { processed } });
  }),
);

export default apiRoutes;
