import { Router, type Request, type Response } from 'express';
import { proxy }       from '../utils/proxy.js';
import { requireRole } from '../middleware/auth.middleware.js';

// ─── Admin Routes  (/api/v1/admin/*) ─────────────────────────────────────────
// All routes require ROLE_ADMIN or ROLE_SUPER_ADMIN.

const HEALTH_CHECK_TIMEOUT_MS = 2_500;

async function pingService(name: string, baseUrl: string): Promise<{
  name: string;
  status: 'healthy' | 'down';
  latencyMs: number;
}> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/health/live`, { signal: controller.signal });
    return { name, status: res.ok ? 'healthy' : 'down', latencyMs: Date.now() - start };
  } catch {
    return { name, status: 'down', latencyMs: Date.now() - start };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Server-side fan-out helper ───────────────────────────────────────────────
//
// The dashboard's headline numbers live in three different services. Fanning
// out here rather than in the browser keeps it to one round trip, and means a
// single slow or dead service degrades one tile instead of the whole page.
//
// The caller's gateway-stamped identity is forwarded so each service's own
// admin guard still runs — this is not an unauthenticated back channel.

const STATS_TIMEOUT_MS = 5_000;

async function fetchServiceJson<T>(
  url: string,
  identity: Record<string, string>,
): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STATS_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { accept: 'application/json', ...identity }, signal: controller.signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function identityHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  const userId = req.headers['x-user-id'];
  const roles  = req.headers['x-user-roles'];
  if (typeof userId === 'string') headers['x-user-id'] = userId;
  if (typeof roles === 'string')  headers['x-user-roles'] = roles;
  return headers;
}

interface OrderStatsPayload {
  data?: {
    gmv: number;
    platformCommission: number;
    totalOrders: number;
    ordersByStatus: Record<string, number>;
    gmvByMonth: Array<{ month: string; gmv: number; orders: number }>;
    currency: string;
  };
}

interface IdentityStatsPayload {
  data?: {
    totalUsers: number;
    totalCustomers: number;
    approvedSellers: number;
    pendingVerifications: number;
    sellersByStatus: Record<string, number>;
  };
}

interface ProductCountsPayload {
  data?: Record<string, number>;
}

export function adminRoutes(targets: Record<string, string>): Router {
  const router = Router();

  // Apply admin guard to every route under /api/v1/admin
  router.use(requireRole('ROLE_ADMIN', 'ROLE_SUPER_ADMIN'));

  const route = (prefix: string, target: string) =>
    router.use(prefix, (req, res, next) => proxy(req, res, target).catch(next));

  // Real-time platform health: server-side pings every registered service's
  // /health/live (avoids the browser having to CORS-call ~30 different
  // ports directly) and returns their actual current status. Not a proxy —
  // this aggregates across every service in one response.
  router.get('/system/health', async (_req: Request, res: Response) => {
    const entries = Object.entries(targets);
    const results = await Promise.all(entries.map(([name, url]) => pingService(name, url)));
    res.json({ success: true, data: results, meta: { checkedAt: new Date().toISOString() } });
  });

  // ─── Admin dashboard ────────────────────────────────────────────────────────
  //
  // /dashboard/stats is an aggregator, not a proxy: order-service owns GMV and
  // order counts, auth-service owns user and seller counts, product-service
  // owns the moderation queue depth. Each slice that fails comes back as zeros
  // and its service name is listed in meta.degraded, so the UI can say which
  // number it could not fetch instead of showing a plausible-looking wrong one.
  router.get('/dashboard/stats', async (req: Request, res: Response) => {
    const identity = identityHeaders(req);
    const base = (url: string) => url.replace(/\/$/, '');

    const [orderStats, identityStats, productCounts] = await Promise.all([
      fetchServiceJson<OrderStatsPayload>(`${base(targets.order)}/api/v1/admin/stats`, identity),
      fetchServiceJson<IdentityStatsPayload>(`${base(targets.auth)}/api/v1/admin/stats`, identity),
      fetchServiceJson<ProductCountsPayload>(`${base(targets.product)}/api/v1/admin/products/counts`, identity),
    ]);

    const degraded: string[] = [];
    if (!orderStats?.data)    degraded.push('order-service');
    if (!identityStats?.data) degraded.push('auth-service');
    if (!productCounts?.data) degraded.push('product-service');

    const orders   = orderStats?.data;
    const people   = identityStats?.data;
    const products = productCounts?.data ?? {};

    res.json({
      success: true,
      data: {
        gmv:                    orders?.gmv ?? 0,
        platformCommission:     orders?.platformCommission ?? 0,
        totalOrders:            orders?.totalOrders ?? 0,
        ordersByStatus:         orders?.ordersByStatus ?? {},
        gmvByMonth:             orders?.gmvByMonth ?? [],
        currency:               orders?.currency ?? 'UGX',
        totalCustomers:         people?.totalCustomers ?? 0,
        totalUsers:             people?.totalUsers ?? 0,
        totalSellers:           people?.approvedSellers ?? 0,
        pendingSellerVerifications: people?.pendingVerifications ?? 0,
        pendingProductApprovals: products.PENDING_APPROVAL ?? 0,
        productsByStatus:       products,
      },
      meta: { generatedAt: new Date().toISOString(), degraded },
    });
  });

  // Both are plain proxies; the target service defines the full path because
  // proxy() forwards req.originalUrl verbatim (see utils/proxy.ts).
  route('/dashboard/recent-orders',  targets.order);
  route('/dashboard/recent-sellers', targets.auth);

  route('/users',      targets.auth);
  route('/products',   targets.product);
  route('/orders',     targets.order);
  route('/payments',   targets.payment);
  route('/categories', targets.product);
  route('/analytics',  targets.analytics);
  route('/sellers',    targets.auth);    // KYC queue: GET /pending, PUT /:id/verify
  route('/reviews',    targets.review);  // review moderation queue
  route('/review-media', targets.review); // review photo/video moderation
  route('/support',    targets.support); // helpdesk queue + CSAT stats
  route('/tax',        targets.tax);     // invoice search, credit notes, VAT summaries
  route('/finance',    targets.payment); // seller withdrawal queue + platform settlement totals
  // Subscriber list + consent records. newsletter-service also enforces
  // ROLE_ADMIN itself, so this proxy entry is not the only guard on it.
  // Arbitration queue: GET /admin/disputes, PATCH /admin/disputes/:id/resolve.
  // Absent entirely before, so the panel could not reach dispute-service at all.
  route('/disputes',   targets.dispute);
  route('/newsletter', targets.newsletter);

  // Search index administration → product-service, which owns `muni-products`.
  //
  // Currently POST /api/v1/admin/search/reindex, which rebuilds the index from
  // the catalogue. Needed after a mapping change, after an Elasticsearch outage
  // (index writes are deliberately non-fatal, so anything edited while ES was
  // down is simply missing), or on a fresh index.
  //
  // This mount is what makes that endpoint reachable at all — without it the
  // path fell through to the gateway's 404 handler, so the guard on
  // product-service's side had nothing to guard.
  //
  // It replaces search-service's POST /api/v1/search/reindex, which sat on the
  // PUBLIC /search prefix, had no authentication, and bulk-wrote whatever
  // `products` array the caller put in the request body straight into the live
  // storefront index. The router.use(requireRole(...)) at the top of this file
  // covers everything below it, so this inherits ROLE_ADMIN / ROLE_SUPER_ADMIN.
  route('/search',     targets.product);

  return router;
}
