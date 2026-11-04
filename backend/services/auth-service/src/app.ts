import 'dotenv/config';
import cookieParser from 'cookie-parser';
import { browserCors } from '../../../shared/http/internal-cors.js';
import express from 'express';
import path    from 'node:path';
import { fileURLToPath } from 'node:url';

import * as controller    from './controllers/auth.controller.js';
import * as totpController  from './controllers/totp.controller.js';
import * as gdprController  from './controllers/gdpr.controller.js';
import { sellerRouter }   from './controllers/seller.controller.js';
import { adminRouter }    from './controllers/admin.controller.js';
import { oauthRouter }    from './controllers/oauth.controller.js';
import * as auth          from './services/auth.service.js';
import * as sellerService from './services/seller.service.js';
import { connectDB, disconnectDB } from './db/prisma.js';
import { connectProducer, disconnectProducer } from './events/kafka.js';
import { readAccessToken } from '../../../shared/utils/token.js';
import { optionalAuth } from '../../../shared/http/service-auth.middleware.js';
import { connectMfaStore, disconnectMfaStore } from './security/mfa-attempt.store.js';
import { captureError, flushSentry, initSentry } from '../../../shared/observability/sentry.js';

// Before anything else that can throw, so a failure during wiring is reported
// rather than lost. No-op unless SENTRY_DSN is set.
initSentry('auth-service');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── App ──────────────────────────────────────────────────────────────────────

const app = express();
app.use(browserCors());
// login/refresh/logout all read `req.cookies.refreshToken`. Without this parser
// req.cookies is undefined, the optional chaining silently falls through to the
// request body, and the httpOnly cookie set at login is never actually used —
// which is the whole mechanism behind sessions being shared across the three
// same-domain frontends.
app.use(cookieParser());
app.use(express.json());
// Apple's OAuth callback uses response_mode=form_post — it POSTs
// application/x-www-form-urlencoded, not JSON, so express.json() alone
// would leave req.body empty for that route.
app.use(express.urlencoded({ extended: true }));

// ─── Uploaded documents ───────────────────────────────────────────────────────
//
// These are seller KYC documents: national IDs, passports, business
// registrations, bank statements. They were served by
//
//   app.use('/uploads', express.static(UPLOAD_DIR));
//
// which is an unauthenticated static mount. Anyone who could reach this service
// and knew — or guessed — a filename could read a stranger's passport scan. The
// names are random UUIDs, so it was not trivially enumerable, but the URLs are
// stored in the database, returned by the seller and admin APIs, and end up in
// browser history and proxy logs; "hard to guess" is not an access control.
//
// Replaced with a route that requires a session and checks the caller is either
// the owner of the document or an admin. Streaming the bytes through the
// service costs a little more than nginx serving them, which is the right trade
// for a few KYC documents per seller — and the S3 path (signed, time-limited
// URLs) is what production should use anyway.
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR ?? './uploads');

// ─── Auth guard (used for protected user routes below) ────────────────────────

/**
 * Identity for the document route below.
 *
 * This read `x-user-id` directly and believed it. The header is whatever the
 * caller typed, and the route it guards streams seller KYC documents —
 * national IDs, passports, bank statements — so naming a victim's user id was
 * enough to read their documents, and the `x-user-roles` check further down
 * meant `x-user-roles: ROLE_ADMIN` read anyone's.
 *
 * `optionalAuth` resolves identity the way the rest of the platform does: the
 * gateway's signed assertion when INTERNAL_IDENTITY_SECRET is configured,
 * falling back to the stamped headers when it is not. The Bearer path is kept
 * underneath it for direct service calls — that one verifies a real JWT
 * signature, so it was never the weak link.
 *
 * Roles land in `res.locals.roles` from the same verified source, which is what
 * the admin check below now reads.
 */
const requireUser = (
  req:  express.Request,
  res:  express.Response,
  next: express.NextFunction,
): void => {
  optionalAuth(req, res, () => {
    if (res.locals.userId) return next();

    // Direct service calls (dev only): fall back to Bearer token validation
    const token = req.header('authorization')?.replace(/^Bearer\s+/i, '');
    const user  = readAccessToken(token);
    if (!user) { res.status(401).json({ message: 'Authentication required' }); return; }
    res.locals.userId = user.sub;
    res.locals.roles  = user.roles ?? [];
    next();
  });
};

/**
 * GET /uploads/<folder>/<file> — an uploaded document, to whoever may see it.
 *
 * Authorisation is ownership-based: a seller may read their own documents, and
 * an admin may read anyone's (that is the point of a verification queue).
 *
 * The path is resolved and then checked to still sit inside UPLOAD_DIR before
 * anything is opened. Express already normalises `..` out of req.path, so this
 * is belt-and-braces — but a path traversal here reads arbitrary files from the
 * container, so it is worth being explicit rather than relying on a framework
 * detail staying true.
 */
app.get(
  /^\/uploads\/(.+)$/,
  (req, res, next) => { requireUser(req, res, next); },
  async (req, res, next) => {
    try {
      const relative = (req.params as unknown as string[])[0] ?? '';
      const resolved = path.resolve(UPLOAD_DIR, relative);

      if (resolved !== UPLOAD_DIR && !resolved.startsWith(UPLOAD_DIR + path.sep)) {
        res.status(400).json({ message: 'Invalid document path' });
        return;
      }

      const userId = res.locals.userId as string;
      // From the verified identity, not the raw header: `x-user-roles` is
      // caller-supplied, and this decides who may read anyone's KYC documents.
      const roles  = (res.locals.roles as string[]) ?? [];
      const isAdmin = roles.includes('ROLE_ADMIN') || roles.includes('ROLE_SUPER_ADMIN');

      const url = `/uploads/${relative.split(path.sep).join('/')}`;
      if (!isAdmin && !(await sellerService.userOwnsDocument(userId, url))) {
        // 404, not 403: a 403 confirms the document exists, which is itself
        // something the caller has no business learning.
        res.status(404).json({ message: 'Document not found' });
        return;
      }

      res.sendFile(resolved, (err) => {
        if (err && !res.headersSent) res.status(404).json({ message: 'Document not found' });
      });
    } catch (e) { next(e); }
  },
);

// ─── Health ───────────────────────────────────────────────────────────────────

app.get('/health',       (_req, res) => res.json({ service: 'auth-service', status: 'up' }));
app.get('/health/live',  (_req, res) => res.json({ service: 'auth-service', status: 'up' }));
app.get('/health/ready', async (_req, res) => {
  try {
    const { prisma } = await import('./db/prisma.js');
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ready', db: 'up' });
  } catch {
    res.status(503).json({ status: 'degraded', db: 'down' });
  }
});

// ─── Auth Routes ──────────────────────────────────────────────────────────────
app.post('/api/v1/auth/register',        controller.register);
app.post('/api/v1/auth/login',           controller.login);
app.post('/api/v1/auth/refresh',         controller.refresh);
app.post('/api/v1/auth/logout',          controller.logout);
app.post('/api/v1/auth/forgot-password', controller.forgotPassword);
app.post('/api/v1/auth/reset-password',  controller.resetPassword);

// ─── 2FA (TOTP) Routes ────────────────────────────────────────────────────────
//
// None of the three can sit behind `requireUser`, because all three serve
// callers who do not yet hold an access token — that is the whole point of a
// second factor. Each is gated inside its handler instead, on a credential the
// server itself minted:
//
//   generate/verify  enrolment. A gateway-stamped session (a signed-in user
//                    turning 2FA on), or the `enrol` challenge token login()
//                    returns with MFA_ENROLLMENT_REQUIRED. requireUser here
//                    made mandatory enrolment impossible to complete: it
//                    demanded the very access token enrolment exists to unlock.
//   authenticate     second leg of login, on the `verify` challenge token.
//
// The guarantee the old `requireUser` provided — that nobody can overwrite
// another account's second factor — is unchanged and now lives in
// requireEnrolmentActor: the subject is read from a signed token or the
// session, never from the request body.
app.post('/api/v1/auth/2fa/generate',     totpController.generate2FASecret);
app.post('/api/v1/auth/2fa/verify',       totpController.verify2FASecret);
app.post('/api/v1/auth/2fa/authenticate', totpController.authenticate2FA);

// ─── GDPR Compliance Routes ───────────────────────────────────────────────────
app.post('/api/v1/user/data-export', requireUser, gdprController.exportUserData);
app.delete('/api/v1/user/account',   requireUser, gdprController.deleteUserAccount);

// ─── OAuth Routes (Google, Facebook …) ───────────────────────────────────────
app.use('/api/v1', oauthRouter);

// ─── User Profile Routes ──────────────────────────────────────────────────────
app.get('/api/v1/users/me', requireUser, async (req, res, next) => {
  try {
    const user = await auth.currentUser(res.locals.userId as string);
    res.json(user);
  } catch (e) { next(e); }
});

app.patch('/api/v1/users/me', requireUser, async (req, res, next) => {
  try {
    const user = await auth.updateUser(
      res.locals.userId as string,
      req.body as object,
    );
    res.json(user);
  } catch (e) { next(e); }
});

app.post('/api/v1/users/me/change-password', requireUser, controller.changePassword);

// ─── Seller Routes ────────────────────────────────────────────────────────────
// POST /api/v1/sellers/register
// GET  /api/v1/sellers/me
// POST /api/v1/sellers/me/documents
app.use('/api/v1', sellerRouter);

// ─── Admin Routes ─────────────────────────────────────────────────────────────
// GET  /api/v1/admin/sellers/pending
// GET  /api/v1/admin/sellers
// GET  /api/v1/admin/sellers/:id
// PUT  /api/v1/admin/sellers/:id/verify
app.use('/api/v1', adminRouter);

// ─── Users list (admin) ───────────────────────────────────────────────────────
// GET /api/v1/users now lives on adminRouter (see admin.controller.ts), so its
// admin guard belongs to the route rather than to the order these mounts happen
// to be written in. Same URL — adminRouter is mounted at /api/v1 above.

// ─── Error Handler ────────────────────────────────────────────────────────────
app.use((
  error: Error & { status?: number; issues?: unknown },
  req:   express.Request,
  res:   express.Response,
  _next: express.NextFunction,
) => {
  // Zod validation errors
  if ((error as { name?: string }).name === 'ZodError') {
    res.status(422).json({ message: 'Validation failed', issues: (error as { issues?: unknown }).issues });
    return;
  }

  const status = error.status ?? 500;

  // Only unexpected failures are worth reporting. A 401 on a bad password or a
  // 409 on a duplicate email is the service working correctly — sending those
  // to Sentry buries the events that matter under normal traffic.
  if (status >= 500) {
    captureError(error, {
      route:  req.path,
      method: req.method,
      status,
      userId: res.locals.userId as string | undefined,
    });
  }

  // `error.message` is returned verbatim below 500 because those messages are
  // written for the caller. A 500's message is internal — a Prisma constraint
  // name, a connection string fragment — so production gets a generic string
  // and the detail goes to the error tracker and the log instead.
  const body = status >= 500 && process.env.NODE_ENV === 'production'
    ? 'Something went wrong on our end. Please try again in a moment.'
    : error.message;

  if (status >= 500) console.error(`[auth-service] ${req.method} ${req.path} →`, error);

  res.status(status).json({ message: body });
});

// ─── Startup ──────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT ?? 4001);

async function start() {
  try {
    await connectDB();
  } catch (err) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[auth-service] Failed to connect to DB — exiting:', err);
      process.exit(1);
    }
    console.warn('[auth-service] ⚠️  DB unavailable — continuing in degraded mode (dev only):', (err as Error).message);
  }

  await connectProducer(); // always non-fatal
  await connectMfaStore(); // non-fatal — degrades to in-process attempt limits

  app.listen(PORT, () =>
    console.log(`[auth-service] 🚀 Listening on port ${PORT}`),
  );
}

async function shutdown(signal: string) {
  console.log(`[auth-service] ${signal} — shutting down`);
  // Flushed first: Sentry buffers, and process.exit below would drop whatever
  // is still in that buffer — including the error that caused the shutdown.
  await flushSentry();
  await disconnectProducer();
  await disconnectMfaStore();
  await disconnectDB();
  process.exit(0);
}

// An unhandled rejection or an uncaught throw is exactly the class of failure
// nobody notices until a user reports it. Reported, flushed, then rethrown to
// Node's default behaviour rather than swallowed — a process in an unknown
// state should still die and be restarted.
process.on('unhandledRejection', (reason) => {
  console.error('[auth-service] Unhandled promise rejection:', reason);
  captureError(reason);
});

process.on('uncaughtException', (error) => {
  console.error('[auth-service] Uncaught exception:', error);
  captureError(error);
  void flushSentry(1000).finally(() => process.exit(1));
});

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start();
