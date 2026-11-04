import { Router, type Request, type Response, type NextFunction } from 'express';
import prisma from '../config/prisma.js';
import env from '../config/env.js';
import logger from '../config/logger.js';
import { SubscribeSchema, UnsubscribeSchema, ListSubscribersSchema } from '../models/newsletter.model.js';
import { requireRole } from '../../../../shared/http/service-auth.middleware.js';
import * as newsletter from '../services/newsletter.service.js';

// ─── Health probes ──────────────────────────────────────────────────────────
export const healthRoutes = Router();

healthRoutes.get('/health/live', (_req, res) => {
  res.json({ service: 'newsletter-service', status: 'up', ts: new Date().toISOString() });
});

healthRoutes.get('/health/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      service: 'newsletter-service',
      ready: true,
      db: 'up',
      optIn: env.singleOptIn ? 'single' : 'double',
      ts: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({ service: 'newsletter-service', ready: false, db: 'down' });
  }
});

healthRoutes.get('/health', (_req, res) => res.json({ status: 'ok', service: 'newsletter-service' }));

// ─── Rate limiting ──────────────────────────────────────────────────────────
//
// In-process and per-IP. Deliberately simple: this endpoint is public and
// unauthenticated, so the thing worth stopping is one host submitting hundreds
// of addresses (list-bombing someone else's inbox with confirmation mail). The
// gateway applies its own global limiter in front of this.

const attempts = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);

  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + env.rateLimit.windowMs });
    return false;
  }

  entry.count += 1;
  return entry.count > env.rateLimit.max;
}

// Unbounded growth would be a slow memory leak on a long-lived process.
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of attempts) {
    if (now > entry.resetAt) attempts.delete(ip);
  }
}, 60_000).unref();

// ─── API ────────────────────────────────────────────────────────────────────
export const apiRoutes = Router();

const asyncRoute =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };

function callerIp(req: Request): string {
  // The gateway sets x-forwarded-for; behind nginx this is the real client.
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip ?? 'unknown';
}

/**
 * POST /newsletter/subscribe
 *
 * The response is deliberately uniform across "new", "already subscribed" and
 * "suppressed". Telling an anonymous caller which addresses are already on the
 * list turns this endpoint into a membership oracle — submit an address, read
 * the response, learn whether that person is a MUNI subscriber. The client gets
 * one neutral confirmation; the distinction is kept in `data.status` only to
 * the extent it does not leak membership (see below).
 */
apiRoutes.post(
  '/newsletter/subscribe',
  asyncRoute(async (req, res) => {
    const ip = callerIp(req);

    if (rateLimited(ip)) {
      res.status(429).json({
        success: false,
        message: 'Too many attempts. Please try again in a minute.',
      });
      return;
    }

    const parsed = SubscribeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: 'Enter a valid email address',
        errors: {
          email: parsed.error.issues.filter((i) => i.path[0] === 'email').map((i) => i.message),
        },
      });
      return;
    }

    const userId = req.headers['x-user-id'];

    const result = await newsletter.subscribe(parsed.data, {
      ip,
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
      userId: typeof userId === 'string' && userId.length > 0 ? userId : undefined,
    });

    // One message for every outcome. `pending` tells the UI whether to say
    // "check your inbox to confirm" — it is a property of this deployment's
    // opt-in mode, not of whether this particular address was already known.
    res.status(result.created ? 201 : 200).json({
      success: true,
      data: {
        pending: !env.singleOptIn,
      },
      message: env.singleOptIn
        ? "You're subscribed. Thanks for joining."
        : 'Almost there — check your inbox to confirm your subscription.',
    });
  }),
);

/** GET /newsletter/confirm?token=… — completes double opt-in. */
apiRoutes.get(
  '/newsletter/confirm',
  asyncRoute(async (req, res) => {
    const parsed = UnsubscribeSchema.safeParse({ token: req.query.token });
    if (!parsed.success) {
      res.status(400).json({ success: false, message: 'That confirmation link is not valid.' });
      return;
    }

    const ok = await newsletter.confirm(parsed.data.token);
    if (!ok) {
      res.status(404).json({ success: false, message: 'That confirmation link is not valid.' });
      return;
    }

    res.json({ success: true, message: 'Your subscription is confirmed.' });
  }),
);

/** POST /newsletter/unsubscribe — one-click, token-based. */
apiRoutes.post(
  '/newsletter/unsubscribe',
  asyncRoute(async (req, res) => {
    const parsed = UnsubscribeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: 'That unsubscribe link is not valid.' });
      return;
    }

    await newsletter.unsubscribe(parsed.data.token);
    logger.info('unsubscribe processed');
    res.json({ success: true, message: 'You have been unsubscribed.' });
  }),
);

/**
 * GET /admin/newsletter/subscribers — the admin subscriber table.
 *
 * Guarded here as well as at the gateway. The gateway already gates
 * /api/v1/admin/* on ROLE_ADMIN, but that is one misrouted proxy entry away
 * from being the only thing standing between this list and the internet, and
 * the list is every address we hold plus its consent record. requireRole
 * resolves identity from the signed internal assertion when one is configured,
 * and falls back to the gateway-stamped headers otherwise.
 *
 * Query: ?status=PENDING|CONFIRMED|UNSUBSCRIBED &market= &q= &page= &limit=
 */
apiRoutes.get(
  '/admin/newsletter/subscribers',
  requireRole('ROLE_ADMIN', 'ROLE_SUPER_ADMIN'),
  asyncRoute(async (req, res) => {
    const parsed = ListSubscribersSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: 'Invalid query parameters',
        errors: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
      return;
    }

    const data = await newsletter.listSubscribers(parsed.data);
    res.json({ success: true, data });
  }),
);

export default apiRoutes;

