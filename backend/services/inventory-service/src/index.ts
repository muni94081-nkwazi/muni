// MUST be first: starts OpenTelemetry before any instrumented library loads.
import { logger } from './utils/logger.js';
import './telemetry.js';
import 'dotenv/config';
import express, { type RequestHandler } from 'express';
import { internalCors } from '../../../shared/http/internal-cors.js';
import { z } from 'zod';
import { INVENTORY_PREFIXES, sellerInventoryPaths } from './routes/paths.js';
import { PrismaClient } from './generated/prisma/index.js';
import { addMinutes } from 'date-fns';
import { reserveInventory, restoreProductAvailability } from './services/reservation.service.js';
import { bumpEntityVersion } from '../../../shared/cache/protected-cache.js';
import { connectCache, disconnectCache } from '../../../shared/cache/redis.js';
import { startRabbitMQOrderConsumer, stopRabbitMQOrderConsumer } from './consumers/order-rabbitmq.consumer.js';
import { connectRabbitMQ, disconnectRabbitMQ } from '../../../shared/rabbitmq/index.js';
import { startExpiryWorker, stopExpiryWorker } from './jobs/expiry.worker.js';
import {
  requireAuth,
  requireInternalCaller,
  assertInternalIdentityConfigured,
} from '../../../shared/http/service-auth.middleware.js';
import { maySee, ownCatalogueFilter } from './auth/scope.js';

// Stock lives on product-service's tables, on the same database — this service
// reads and writes them through its own generated client. `npm run db:generate`
// emits it from prisma/schema.prisma, which is a non-authoritative mirror of
// product-service's models; see the header there before editing.
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

const app  = express();
const PORT = Number(process.env.PORT ?? 4004);

app.use(internalCors());
app.use(express.json());

const RESERVATION_TTL_MINUTES = Number(process.env.RESERVATION_TTL_MINUTES ?? 15);
const LOW_STOCK_THRESHOLD     = Number(process.env.LOW_STOCK_THRESHOLD ?? 5);

// ─── Request validation ───────────────────────────────────────────────────────
//
// Every route below moves stock. The hand-rolled checks they carried caught a
// missing quantity but not a fractional or absurd one, and `deduct` and
// `release` checked nothing at all — a `quantity` of `"abc"` reached a raw SQL
// `GREATEST(0, reserved - $1)` as NaN.

const ReserveSchema = z.object({
  quantity:  z.number().int().min(1).max(10_000),
  sessionId: z.string().trim().min(1, 'sessionId is required').max(128),
  userId:    z.string().trim().max(128).optional(),
});

const ReleaseSchema = z.object({
  reservationId: z.string().trim().min(1).optional(),
  quantity:      z.number().int().min(1).max(10_000).optional(),
}).refine(
  (data) => data.reservationId !== undefined || data.quantity !== undefined,
  { message: 'Provide either a reservationId or a quantity to release' },
);

const DeductSchema = z.object({
  quantity:      z.number().int().min(1).max(10_000),
  reservationId: z.string().trim().min(1).optional(),
});

const RestoreSchema = z.object({
  quantity: z.number().int().min(1).max(10_000),
  /** Recorded on the log line so a restore can be traced to what caused it. */
  reason:   z.string().trim().max(200).optional(),
});

const RestockSchema = z.object({
  stock:             z.number().int().min(0).max(10_000_000).optional(),
  lowStockThreshold: z.number().int().min(0).max(100_000).optional(),
}).refine(
  (data) => data.stock !== undefined || data.lowStockThreshold !== undefined,
  { message: 'Provide stock or lowStockThreshold to update' },
);

function invalid(res: express.Response, error: z.ZodError) {
  return res.status(400).json({
    success: false,
    message: 'Invalid request',
    errors:  error.flatten().fieldErrors,
  });
}

// ── Health ─────────────────────────────────────────────────────────────────────

app.get('/health',       async (_req, res) => { await prisma.$queryRaw`SELECT 1`; res.json({ status: 'ok', service: 'inventory-service', db: 'connected' }); });
app.get('/health/live',  (_req, res) => res.json({ status: 'ok' }));
app.get('/health/ready', async (_req, res) => { try { await prisma.$queryRaw`SELECT 1`; res.json({ status: 'ok' }); } catch { res.status(503).json({ status: 'error', db: 'disconnected' }); } });

// ── Who is asking, and what may they see ──────────────────────────────────────
//
// Every seller-facing route below is scoped to the caller's own catalogue.
// Before this, `listInventory` and `lowStockAlerts` selected on `active: true`
// with no seller filter at all, so one seller's stock page returned every
// variant on the platform — SKUs, stock levels and reservation counts for every
// competitor. seller-center filtered the rows client-side, which hid it, but
// the data still crossed the wire and the raw endpoint returned all of it.
//
// Identity is read from `res.locals`, never from `x-user-id`. requireAuth
// stashes it there after verifying the gateway's SIGNED assertion; the raw
// header is unverified noise in that mode, and trusting it is what lets a
// forged header act as any user.

/**
 * Answer for a variant the caller may not touch.
 *
 * 404, not 403. A 403 confirms the variant id or SKU exists, which turns these
 * routes into an oracle for enumerating a competitor's catalogue — the thing
 * the scoping exists to prevent. It is also true from the caller's point of
 * view: the variant is not in their inventory.
 */
function notFound(res: express.Response, what: string) {
  return res.status(404).json({ success: false, message: `${what} not found` });
}

// ── Seller-facing read/write handlers ─────────────────────────────────────────
//
// Named rather than inline so each can be registered under both prefixes —
// see the registration block below.

const listInventory: RequestHandler = async (_req, res) => {
  const variants = await prisma.productVariant.findMany({
    // The `product` clause is what keeps one seller out of another's stock.
    // Filtered in the QUERY rather than after the fetch: post-filtering would
    // still pull every seller's rows out of the database and into this
    // process, and the cost of that grows with the platform, not the caller.
    where:   { active: true, ...ownCatalogueFilter(res) },
    include: { product: { select: { id: true, name: true, sellerId: true } } },
    orderBy: { stock: 'asc' },
  });

  const lowStock = variants.filter((v) => v.stock - v.reserved <= LOW_STOCK_THRESHOLD);

  // A seller with no products gets 200 and an empty array, not a 404 — "you
  // have no stock yet" is a normal state for a new seller, and the UI renders
  // its own empty state from it.
  res.json({
    success: true,
    data:    variants.map(formatVariant),
    meta:    { total: variants.length, lowStock: lowStock.length },
  });
};

const getVariant: RequestHandler = async (req, res) => {
  const variant = await prisma.productVariant.findUnique({
    where:   { id: req.params.variantId },
    // sellerId is selected so ownership can be checked. Without it this route
    // returned any variant's stock and reservation count to any caller.
    include: { product: { select: { id: true, name: true, sellerId: true } } },
  }).catch(() => null);

  if (!maySee(res, variant)) return notFound(res, 'Variant');
  return res.json({ success: true, data: formatVariant(variant!) });
};

const getBySku: RequestHandler = async (req, res) => {
  const variant = await prisma.productVariant.findUnique({
    where:   { sku: req.params.sku },
    include: { product: { select: { id: true, name: true, sellerId: true } } },
  }).catch(() => null);

  // SKUs are guessable — they are printed on labels and often follow a visible
  // pattern — so this was the easiest of the three routes to walk through a
  // competitor's catalogue.
  if (!maySee(res, variant)) return notFound(res, 'SKU');
  return res.json({ success: true, data: formatVariant(variant!) });
};

// ── POST /api/v1/inventory/:variantId/reserve — pessimistic lock ─────────────

app.post('/api/v1/inventory/:variantId/reserve', requireInternalCaller, async (req, res) => {
  const parsed = ReserveSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);

  const { quantity, sessionId, userId } = parsed.data;

  try {
    const reservation = await reserveInventory(prisma, {
      variantId:  req.params.variantId,
      quantity,
      sessionId,
      userId,
      ttlMinutes: RESERVATION_TTL_MINUTES,
    });

    // A hold changes availableStock, which the storefront shows, so the cached
    // view is stale from here too.
    await settleDerivedState(req.params.variantId);

    return res.status(201).json({
      success:       true,
      data:          { reservationId: reservation.id, expiresAt: reservation.expiresAt },
      message:       `Reserved ${quantity} unit(s) for ${RESERVATION_TTL_MINUTES} minutes`,
    });
  } catch (err) {
    const e = err as Error & { status?: number };
    return res.status(e.status ?? 500).json({ success: false, message: e.message });
  }
});

// ── POST /api/v1/inventory/:variantId/release ────────────────────────────────

app.post('/api/v1/inventory/:variantId/release', requireInternalCaller, async (req, res) => {
  const parsed = ReleaseSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);

  const { reservationId, quantity } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      if (reservationId) {
        // Release specific reservation
        const reservation = await tx.inventoryReservation.delete({ where: { id: reservationId } }).catch(() => null);
        if (reservation) {
          await tx.$executeRaw`
            UPDATE "ProductVariant"
            SET reserved = GREATEST(0, reserved - ${reservation.quantity}), "updatedAt" = NOW()
            WHERE id = ${req.params.variantId}
          `;
        }
      } else if (quantity) {
        await tx.$executeRaw`
          UPDATE "ProductVariant"
          SET reserved = GREATEST(0, reserved - ${quantity}), "updatedAt" = NOW()
          WHERE id = ${req.params.variantId}
        `;
      }
    });

    // Sellable stock has just come back. Without this the product stays
    // OUT_OF_STOCK — the status inventory set when the hold was taken — and
    // the unit that was never bought is unsellable from here on.
    //
    // Outside the transaction and non-fatal, like its counterpart on reserve:
    // the release itself has already committed and must not be undone by a
    // failure to update a derived flag.
    await restoreVariantProduct(req.params.variantId);

    return res.json({ success: true, message: 'Reservation released' });
  } catch (err) {
    return res.status(500).json({ success: false, message: (err as Error).message });
  }
});

// ── POST /api/v1/inventory/:variantId/restore — goods coming back ────────────
//
// The inverse of `deduct`, and it did not exist. Once stock was deducted, the
// only way back onto the shelf was a seller manually PUTting an absolute stock
// figure — so cancelling a paid order destroyed the units permanently. The
// order went to 'cancelled', the customer was refunded, and the goods were
// gone from the catalogue with nothing recording where.
//
// Internal-only, like reserve/deduct/release: this adds sellable stock, and
// nothing a browser sends should be able to do that.
app.post('/api/v1/inventory/:variantId/restore', requireInternalCaller, async (req, res) => {
  const parsed = RestoreSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);

  const { quantity, reason } = parsed.data;

  try {
    const updated = await prisma.$executeRaw`
      UPDATE "ProductVariant"
      SET stock = stock + ${quantity}, "updatedAt" = NOW()
      WHERE id = ${req.params.variantId}
    `;

    if (updated === 0) return notFound(res, 'Variant');

    logger.info('stock restored', { detail: { variantId: req.params.variantId, quantity, reason } });

    // The product may have gone OUT_OF_STOCK while these units were away.
    await restoreVariantProduct(req.params.variantId);

    return res.json({ success: true, message: `Restored ${quantity} unit(s)` });
  } catch (err) {
    return res.status(500).json({ success: false, message: (err as Error).message });
  }
});

// ── POST /api/v1/inventory/:variantId/deduct — on order confirmed ────────────

app.post('/api/v1/inventory/:variantId/deduct', requireInternalCaller, async (req, res) => {
  const parsed = DeductSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);

  const { quantity, reservationId } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE "ProductVariant"
        SET
          stock    = GREATEST(0, stock - ${quantity}),
          reserved = GREATEST(0, reserved - ${quantity}),
          "updatedAt" = NOW()
        WHERE id = ${req.params.variantId}
      `;

      if (reservationId) {
        await tx.inventoryReservation.deleteMany({ where: { id: reservationId } });
      }
    });

    // A purchase is the case that matters most here: without it the storefront
    // kept advertising the pre-purchase stock for up to the cache's 300s TTL.
    await settleDerivedState(req.params.variantId);

    return res.json({ success: true, message: `Deducted ${quantity} unit(s)` });
  } catch (err) {
    return res.status(500).json({ success: false, message: (err as Error).message });
  }
});

const restock: RequestHandler = async (req, res) => {
  const parsed = RestockSchema.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);

  const { stock, lowStockThreshold } = parsed.data;

  // Ownership is checked BEFORE the write, and this is the sharpest edge in the
  // file. requireAuth established that the caller is a signed-in seller and
  // nothing more: the update below was keyed on `req.params.variantId` alone,
  // so any seller could PUT a stock level onto ANY variant on the platform.
  //
  // That is not a read leak, it is a write. `{ "stock": 0 }` against a rival's
  // variant id takes their product off the storefront — product-service derives
  // `inStock` from variant stock, so the listing stops being sellable — and
  // nothing in the response or the logs distinguishes it from that seller
  // restocking their own line.
  const existing = await prisma.productVariant.findUnique({
    where:   { id: req.params.variantId },
    include: { product: { select: { sellerId: true } } },
  }).catch(() => null);

  if (!maySee(res, existing)) return notFound(res, 'Variant');

  const updated = await prisma.productVariant.update({
    where: { id: req.params.variantId },
    data: {
      ...(stock              !== undefined && { stock }),
      ...(lowStockThreshold  !== undefined && { lowStockThreshold }),
    },
  });

  // A seller putting stock back on a line that had sold out should put the
  // product back on the storefront with it.
  await restoreVariantProduct(req.params.variantId);

  return res.json({ success: true, data: formatVariant(updated) });
};

const lowStockAlerts: RequestHandler = async (_req, res) => {
  const variants = await prisma.productVariant.findMany({
    where: {
      active: true,
      stock: { lte: LOW_STOCK_THRESHOLD },
      // Same scoping as listInventory. This route already required auth, but
      // authentication only established WHO was asking — it never limited WHAT
      // came back, so a seller's low-stock alerts listed every competitor
      // running low. That is close to commercially sensitive: it says which of
      // a rival's lines are about to go unavailable.
      ...ownCatalogueFilter(res),
    },
    include: { product: { select: { id: true, name: true, sellerId: true } } },
  });

  return res.json({ success: true, data: variants.map(formatVariant), meta: { count: variants.length } });
};

// ── Registration ──────────────────────────────────────────────────────────────
//
// Every route above is registered under TWO prefixes.
//
// The gateway mounts `route('/inventory', targets.inventory)` under
// /api/v1/seller and forwards req.originalUrl verbatim (see
// api-gateway/src/utils/proxy.ts — there is no path rewriting), so a seller
// client asking for their stock arrived here as /api/v1/seller/inventory/:id
// and fell through to a 404. Every seller inventory request failed; the seller
// UI never noticed because it was reading mock data.
//
// Aliased rather than renamed so internal callers already using
// /api/v1/inventory keep working — the same fix order-service applied for
// /seller/orders.
//
// Note what is NOT aliased: reserve, release and deduct stay on the bare
// prefix only. They are service-to-service steps guarded by
// requireInternalCaller, and there is no reason to widen their surface.
//
// Every seller-facing route carries requireAuth. Three of them did not: list,
// by-sku and by-variant were reachable with no identity at all, and each
// returned stock and reservation counts for the whole platform.
//
// The gateway did put ROLE_SELLER in front of /api/v1/seller/inventory, so
// these were not open to the public internet — but the guard has to be here
// too. The bare /api/v1/inventory prefix is not mounted at the gateway, so
// anything that can reach this service's port reaches those routes directly,
// and "the network keeps strangers out" is the assumption that stops being
// true the first time a NetworkPolicy is wrong.
//
// requireAuth is also what makes the scoping possible: it resolves the caller
// into res.locals.userId, and without it there is no identity to filter by.
// Adding the filter without the guard would have thrown on every anonymous
// request instead of denying it cleanly.
//
// Safe for internal callers: checkout-service's saga and order-service's
// catalog client only ever call reserve / release / deduct, which stay on the
// bare prefix behind requireInternalCaller and are untouched here.
for (const prefix of INVENTORY_PREFIXES) {
  const path = sellerInventoryPaths(prefix);
  app.get(path.list,      requireAuth, listInventory);
  app.get(path.bySku,     requireAuth, getBySku);
  app.get(path.lowStock,  requireAuth, lowStockAlerts);
  app.get(path.byVariant, requireAuth, getVariant);
  app.put(path.byVariant, requireAuth, restock);
}

// ── Helper ────────────────────────────────────────────────────────────────────

/**
 * Settle the derived state that follows a stock movement: whether the product
 * is sellable again, and the storefront's cached view of it.
 *
 * The cache half is the fix for a real staleness window. product-service serves
 * `GET /api/v1/products/:id` through a versioned Redis cache with a 300-second
 * TTL, keyed `ver:product:<id>`. This service writes `ProductVariant` with raw
 * SQL — which is the right way to take stock under a row lock — but that write
 * goes nowhere near product-service's cache, so for up to five minutes after a
 * purchase the storefront kept showing the pre-purchase stock. Observed during
 * Stage 6: a cancellation restored two units and a read through product-service
 * still reported the old figure long after the database had the new one.
 *
 * `bumpEntityVersion` is product-service's OWN invalidation primitive from
 * shared/cache — not a second cache, and not a new endpoint. Incrementing the
 * version retires every key derived from it, so the next read re-derives from
 * Postgres.
 *
 * Everything here is best-effort and outside the transaction: the stock move
 * has already committed and must never be undone by a failure to update a
 * derived view.
 */
async function settleDerivedState(variantId: string): Promise<void> {
  // Raw, because this service's Prisma model is a narrow view of the Product
  // table and does not map `slug` — product-service owns that column. Reading
  // it directly avoids widening the model (and regenerating a client) just to
  // learn one string.
  const rows = await prisma.$queryRaw<Array<{ productId: string; slug: string | null }>>`
    SELECT v."productId" AS "productId", p.slug AS slug
    FROM "ProductVariant" v
    JOIN "Product" p ON p.id = v."productId"
    WHERE v.id = ${variantId}
    LIMIT 1
  `.catch(() => [] as Array<{ productId: string; slug: string | null }>);

  const variant = rows[0];
  if (!variant) return;

  await restoreProductAvailability(prisma, variant.productId).catch(() => { /* derived state only */ });

  // Both keys product.service.ts reads through: by id and by slug. Missing
  // either leaves one of the two storefront paths serving the old figure.
  await bumpEntityVersion('product', variant.productId).catch(() => { /* cache only */ });
  if (variant.slug) {
    await bumpEntityVersion('product-slug', variant.slug).catch(() => { /* cache only */ });
  }
}

/** Kept as the old name so the existing call sites read unchanged. */
const restoreVariantProduct = settleDerivedState;

function formatVariant(v: { id: string; sku: string; productId: string; stock: number; reserved: number; lowStockThreshold: number; [key: string]: unknown }) {
  return {
    ...v,
    availableStock: v.stock - v.reserved,
    inStock:        v.stock - v.reserved > 0,
    isLowStock:     v.stock - v.reserved <= v.lowStockThreshold,
  };
}

// ── Startup ───────────────────────────────────────────────────────────────────

async function start() {
  // Non-fatal, like every other cache connection on the platform: a Redis
  // outage must not stop stock from moving. Without it the version bumps below
  // are no-ops and the storefront simply stays stale for the TTL, which is the
  // behaviour this whole service had before.
  await connectCache('inventory-service').catch(() => { /* bumps become no-ops */ });

  // Verify DB connection
  await prisma.$connect();
  logger.info('✅ Database connected');

  try {
    await connectRabbitMQ();
    await startRabbitMQOrderConsumer();
  } catch (err) {
    logger.warn('RabbitMQ consumer failed to start (non-fatal)', { detail: (err as Error).message });
  }

  // Releases stock held by reservations past their TTL. Deliberately not
  // awaited: BullMQ's connection uses maxRetriesPerRequest: null, so if Redis
  // is unreachable queue.add() retries forever rather than rejecting, and
  // awaiting it here would stop the service ever binding its port. The sweep
  // is a background concern; the API must come up either way.
  startExpiryWorker()
    .then(() => logger.info('✅ Expiry worker started (sweep every 5m)'))
    .catch((err) => logger.warn('Expiry worker failed to start (non-fatal)', { detail: (err as Error).message }));

  // Before anything binds a port: without a verifiable identity secret this
  // service trusts plain x-user-id headers, which is an authorization gap, not
  // a degraded mode. Fatal in production, a warning elsewhere.
  assertInternalIdentityConfigured('inventory-service');

  const server = app.listen(PORT, () =>
    logger.info(`🚀 Listening on port ${PORT}`)
  );

  async function shutdown(signal: string) {
    logger.info(`${signal} — shutting down`);
    await Promise.allSettled([stopRabbitMQOrderConsumer(), disconnectRabbitMQ(), stopExpiryWorker()]);
    await prisma.$disconnect();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

start().catch((err) => {
  logger.error('Fatal startup error', { detail: err });
  process.exit(1);
});

export default app;
