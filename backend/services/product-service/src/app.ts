import 'dotenv/config';
import express from 'express';
import { internalCors } from '../../../shared/http/internal-cors.js';
import { requireRole } from '../../../shared/http/service-auth.middleware.js';
import multer from 'multer';

// ── Controllers ───────────────────────────────────────────────────────────────
import * as productController  from './controllers/product.controller.js';
import * as reviewController   from './controllers/review.controller.js';
import * as categoryController from './controllers/category.controller.js';
import * as variantController  from './controllers/variant.controller.js';
import * as importController   from './controllers/import.controller.js';

// ── Shared ────────────────────────────────────────────────────────────────────
import { connectCache, disconnectCache, isCacheReady } from '../../../shared/cache/redis.js';
import { mountHealthRoutes } from '../../../shared/health/health-check.js';

// ── BullMQ worker (starts automatically) ─────────────────────────────────────
import { startImportWorker } from './jobs/import.worker.js';
import { closeImportQueue  } from './jobs/import.queue.js';

// ── Kafka (price.updated → wishlist-service) ─────────────────────────────────
import { connectProducer, disconnectProducer } from '../../../shared/kafka/producer.js';

// ── Elasticsearch index bootstrap ─────────────────────────────────────────────
import { ensureIndex } from './services/search.service.js';

// ── DB ────────────────────────────────────────────────────────────────────────
import { prisma } from './db/prisma.js';

// ─────────────────────────────────────────────────────────────────────────────

const app = express();

app.use(internalCors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Health Checks ─────────────────────────────────────────────────────────────

app.use(
  mountHealthRoutes('product-service', [
    {
      name:     'redis',
      critical: false,
      check:    () => isCacheReady(),
    },
    {
      name:     'database',
      critical: true,
      check:    async () => {
        await prisma.$queryRaw`SELECT 1`;
        return true;
      },
    },
  ]),
);

// ── Category Routes ───────────────────────────────────────────────────────────

// Public reads
app.get('/api/v1/categories',            categoryController.getTree);
app.get('/api/v1/categories/flat',       categoryController.getFlat);
app.get('/api/v1/categories/:id',        categoryController.getOne);

// Admin CRUD
app.post  ('/api/v1/admin/categories',     categoryController.create);
app.patch ('/api/v1/admin/categories/:id', categoryController.update);
app.delete('/api/v1/admin/categories/:id', categoryController.remove);

// ── Product Routes ────────────────────────────────────────────────────────────

// Public reads (order matters — specific routes before :id)
app.get('/api/v1/products',                   productController.list);
app.get('/api/v1/products/slug/:slug',         productController.slug);
app.get('/api/v1/products/trending',           productController.trending);
app.get('/api/v1/products/:id/related',        productController.related);
app.get('/api/v1/products/:id',                productController.get);

// Seller mutations moved to /api/v1/seller/products (see below).
//
// They previously lived here, under the prefix the gateway mounts as PUBLIC
// (`pub('/products', targets.product)` in customer.routes.ts — no requireAuth,
// no requireRole). The only check was "is x-user-id present", which optionalAuth
// stamps for *any* signed-in user — so a plain customer's token was enough to
// POST a product into the catalogue. The /seller prefix carries
// requireRole('ROLE_SELLER', …) at the gateway, which is the check that was
// missing.

// Search (alias)
app.get('/api/v1/search', productController.list);

// ── Variant Routes ────────────────────────────────────────────────────────────

// Registered before the `:id` patterns below so a literal `/variants/` segment
// is never captured as a product id.
app.get   ('/api/v1/products/variants/:variantId',       variantController.getVariantById);

app.get   ('/api/v1/products/:id/variants',              variantController.getVariants);
// Canonical single-variant read, and the sibling GET the PUT/DELETE below
// always implied. checkout-service prices cart lines through this route; the
// variant must belong to `:id`, so the product id cannot be used to reach an
// unrelated SKU.
app.get   ('/api/v1/products/:id/variants/:variantId',   variantController.getVariantById);
app.post  ('/api/v1/products/:id/variants',              variantController.createVariant);
app.put   ('/api/v1/products/:id/variants/:variantId',   variantController.updateVariant);
app.delete('/api/v1/products/:id/variants/:variantId',   variantController.deleteVariant);

// ── Review Routes ─────────────────────────────────────────────────────────────

app.get ('/api/v1/products/:id/reviews',  reviewController.list);
app.post('/api/v1/products/:id/reviews',  reviewController.create);

// ── Bulk Import / Export Routes ───────────────────────────────────────────────

// Note: uploadMiddleware is multer — must come BEFORE express.json for this route
app.post('/api/v1/seller/products/import',
  importController.uploadMiddleware,
  importController.uploadImport,
);

app.get('/api/v1/seller/products/import/template', importController.downloadTemplate);
app.get('/api/v1/seller/products/import/:jobId',   importController.getImportStatus);
app.get('/api/v1/seller/products/export',          importController.exportProducts);

// ── Seller Product Routes (/api/v1/seller/products) ───────────────────────────
//
// The gateway proxies req.originalUrl verbatim (see api-gateway/src/utils/proxy.ts
// — `new URL(req.originalUrl, target)`), so the prefix the client calls is the
// prefix this service must own. /api/v1/seller/* has already passed
// requireRole('ROLE_SELLER', …) at the gateway.
//
// Registered AFTER /import and /export above: '/:id' would otherwise capture
// the literal segments 'import' and 'export'.

// The guard is applied here as well as at the gateway, and the two are not
// redundant: the gateway proves the caller holds a seller session, while this
// resolves WHICH seller from the signed assertion into res.locals, which is the
// value every handler below scopes its query by. Reading the raw x-user-id
// header instead — as these handlers did — meant a request that reached this
// pod's port directly owned whatever catalogue it claimed to.
//
// The role list mirrors the gateway's seller router (seller.routes.ts:11) so
// admin support access is unchanged.
const requireSeller = requireRole('ROLE_SELLER', 'ROLE_ADMIN', 'ROLE_SUPER_ADMIN');

app.get   ('/api/v1/seller/products',      requireSeller, productController.sellerList);
app.post  ('/api/v1/seller/products',      requireSeller, productController.create);
app.get   ('/api/v1/seller/products/:id',  requireSeller, productController.sellerGet);
app.put   ('/api/v1/seller/products/:id',  requireSeller, productController.update);
app.delete('/api/v1/seller/products/:id',  requireSeller, productController.remove);

// ── Admin Moderation Routes (/api/v1/admin/products) ──────────────────────────
// Gated by requireRole('ROLE_ADMIN', 'ROLE_SUPER_ADMIN') at the gateway.
// '/counts' precedes '/:id' for the same reason as above.

app.get  ('/api/v1/admin/products',                productController.adminList);
app.get  ('/api/v1/admin/products/counts',          productController.adminCounts);
app.get  ('/api/v1/admin/products/:id',             productController.adminGet);
app.patch('/api/v1/admin/products/:id/moderate',    productController.moderate);

// ── Admin: rebuild the search index ───────────────────────────────────────────
//
// Guarded HERE as well as at the gateway, unlike the /admin/products routes
// above which rely on the gateway alone. Two reasons this one is different:
// it is expensive enough to be a denial-of-service on its own, and it replaces
// search-service's `POST /search/reindex`, which had no authentication at all
// and accepted the documents to write from the request body.
//
// requireRole verifies the gateway's SIGNED identity assertion when
// INTERNAL_IDENTITY_SECRET is set, falling back to the stamped headers — so a
// request arriving directly on this service's port with a hand-written
// `x-user-roles: ROLE_ADMIN` does not get through.
app.post(
  '/api/v1/admin/search/reindex',
  requireRole('ROLE_ADMIN', 'ROLE_SUPER_ADMIN'),
  productController.reindexSearch,
);

// ── Global Error Handler ──────────────────────────────────────────────────────

app.use((
  error: Error & { status?: number },
  _req:  express.Request,
  res:   express.Response,
  _next: express.NextFunction,
) => {
  const status = error.status ?? 500;
  const message = status < 500 ? error.message : 'Internal server error';
  if (status >= 500) console.error('[product-service] Unhandled error:', error);
  res.status(status).json({ success: false, error: message });
});

// ── Startup ───────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT ?? 4002);

async function start() {
  // 1. Connect PostgreSQL
  await prisma.$connect();
  console.log('[product-service] ✅ Database connected');

  // 2. Connect Redis cache (non-fatal)
  try {
    await connectCache('product-service');
    console.log('[product-service] ✅ Redis cache connected');
  } catch (err) {
    console.warn('[product-service] ⚠️  Redis unavailable — caching disabled:', (err as Error).message);
  }

  // 3. Ensure Elasticsearch index exists (non-fatal)
  if (process.env.ELASTICSEARCH_URL) {
    try {
      await ensureIndex();
      console.log('[product-service] ✅ Elasticsearch index ready');
    } catch (err) {
      console.warn('[product-service] ⚠️  Elasticsearch unavailable:', (err as Error).message);
    }
  }

  // 4. Connect the Kafka producer (non-fatal)
  //
  // Publishes `price.updated` on product-events when an ACTIVE listing's price
  // changes. wishlist-service consumes that to update stored prices and fire
  // price-drop alerts — a consumer that was fully written and had never
  // received a message, because nothing published to the topic.
  //
  // Non-fatal by design, like the cache and the index above: publish() logs and
  // drops when the broker is unreachable, so a price edit still succeeds.
  // Deliberately NOT awaited.
  //
  // kafkajs retries an unreachable broker with exponential backoff — measured
  // locally at 706ms, 1.5s, 3s, 6.9s and climbing — and awaiting that held the
  // whole of start() open, so `app.listen` below did not run and the port
  // stayed CLOSED for roughly half a minute after every restart. Worse, the
  // retries carried on afterwards and competed with the first real requests:
  // the first product approval after a restart took over 8 seconds and tripped
  // the gateway's timeout, so an admin saw a 504 for an approval that had in
  // fact committed and set the product ACTIVE.
  //
  // Connecting in the background costs nothing: publish() already logs and
  // drops when the producer is not ready, which is the documented non-fatal
  // behaviour above. Nothing in a request path awaits the producer.
  void connectProducer()
    .then(() => console.log('[product-service] ✅ Kafka producer connected'))
    .catch((err) => console.warn(
      '[product-service] ⚠️  Kafka unavailable — price events will be dropped:',
      (err as Error).message,
    ));

  // 5. Start BullMQ import worker
  const importWorker = startImportWorker();
  console.log('[product-service] ✅ Import worker started (concurrency: 2)');

  // 6. Start HTTP server
  const server = app.listen(PORT, () =>
    console.log(`[product-service] 🚀 Listening on port ${PORT}`),
  );

  // ── Graceful Shutdown ───────────────────────────────────────────────────────

  async function shutdown(signal: string) {
    console.log(`[product-service] ${signal} — shutting down`);
    server.close(async () => {
      await importWorker.close();
      await closeImportQueue();
      // Flushed before exit so an in-flight price.updated is not dropped.
      await disconnectProducer();
      await disconnectCache();
      await prisma.$disconnect();
      console.log('[product-service] 👋 Shutdown complete');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 15_000).unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

start().catch((err) => {
  console.error('[product-service] Fatal startup error:', err);
  process.exit(1);
});

export default app;
