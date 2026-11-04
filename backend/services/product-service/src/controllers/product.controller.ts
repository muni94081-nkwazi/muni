import type { Request, Response } from 'express';
import * as productService from '../services/product.service.js';
// import * as searchService  from '../services/search.service.js';

export async function list(req: Request, res: Response): Promise<void> {
  try {
    if (req.query.q && process.env.ELASTICSEARCH_URL) {
      // If we had a searchService we would call it:
      // const result = await searchService.searchProducts(req.query);
      // res.json({ success: true, data: result });
      // return;
    }
    const result = await productService.listProducts(req.query);
    res.json({ success: true, ...result });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      res.status(422).json({ success: false, message: 'Validation failed', issues: error.issues });
    } else {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}

export async function get(req: Request, res: Response): Promise<void> {
  try {
    const product = await productService.getProductById(req.params.id);
    if (!product) {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }
    await productService.incrementViewCount(req.params.id);
    res.json({ success: true, data: product });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
}

export async function slug(req: Request, res: Response): Promise<void> {
  try {
    const product = await productService.getProductBySlug(req.params.slug);
    if (!product) {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }
    await productService.incrementViewCount(product.id);
    res.json({ success: true, data: product });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
}

export async function related(req: Request, res: Response): Promise<void> {
  try {
    const products = await productService.getRelatedProducts(req.params.id);
    res.json({ success: true, data: products });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * GET /api/v1/products/trending
 *
 * Was wired to `list()`, which made "trending" mean "newest". Capped at 20
 * server-side, so `?limit=5000` is a smaller page rather than a full-catalogue
 * scored sort.
 */
export async function trending(req: Request, res: Response): Promise<void> {
  try {
    const requested = Number(req.query.limit);
    const result = await productService.getTrendingProducts(
      Number.isFinite(requested) ? requested : undefined,
    );
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const sellerId = actorId(req, res);
    if (!sellerId) return;
    const product = await productService.createProduct(sellerId, req.body);
    res.status(201).json({ success: true, data: product });
  } catch (error: any) {
    // Through `fail` rather than a bare 500: it maps ZodError to 422 with the
    // field-level issues seller-center renders, P2025 to 404, and anything with
    // a `status` to that status — which is how the slug-collision 409 and the
    // ownership 403 reach the seller as something they can act on instead of
    // "Internal server error".
    fail(res, error);
  }
}

export async function update(req: Request, res: Response): Promise<void> {
  try {
    const userId = actorId(req, res);
    if (!userId) return;
    const product = await productService.updateProduct(req.params.id, String(userId), req.body);
    res.json({ success: true, data: product });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      res.status(422).json({ success: false, message: 'Validation failed', issues: error.issues });
    } else if (error.status === 403) {
      res.status(403).json({ success: false, message: 'Forbidden' });
    } else {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}

export async function remove(req: Request, res: Response): Promise<void> {
  try {
    const userId = actorId(req, res);
    if (!userId) return;
    await productService.deleteProduct(req.params.id, String(userId));
    res.json({ success: true, message: 'Product archived' });
  } catch (error: any) {
    if (error.status === 403) {
      res.status(403).json({ success: false, message: 'Forbidden' });
    } else {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}

// ─── Moderation ───────────────────────────────────────────────────────────────
//
// Path prefixes carry the authorization: /api/v1/seller/* and /api/v1/admin/*
// are gated by requireRole() at the gateway before they reach this service, and
// x-user-id is stamped there from the verified JWT (see the gateway's
// stripClientIdentity — a client cannot forge it). So these handlers treat the
// header as trustworthy identity but still scope every seller query by it.

/** Map a thrown service error onto a response. */
function fail(res: Response, error: any): void {
  if (error.name === 'ZodError') {
    res.status(422).json({ success: false, message: 'Validation failed', issues: error.issues });
    return;
  }
  // Prisma's findUniqueOrThrow
  if (error.code === 'P2025') {
    res.status(404).json({ success: false, message: 'Product not found' });
    return;
  }
  const status = typeof error.status === 'number' ? error.status : 500;
  res.status(status).json({
    success: false,
    message: status >= 500 ? 'Internal server error' : error.message,
  });
  if (status >= 500) console.error('[product-service] ', error);
}

/**
 * The acting seller, from the verified identity.
 *
 * `res.locals.userId` is set by the shared auth middleware, which verifies the
 * gateway's signed assertion when INTERNAL_IDENTITY_SECRET is configured and
 * falls back to the stamped header when it is not. The raw `x-user-id` header
 * is only read in that fallback, inside the middleware — reading it here would
 * mean a request arriving on this pod's port with a hand-written header owned
 * whatever catalogue it named.
 */
function actorId(_req: Request, res: Response): string | null {
  const userId = res.locals.userId;
  if (!userId) {
    res.status(401).json({ success: false, message: 'Unauthorized' });
    return null;
  }
  return String(userId);
}

/** GET /api/v1/seller/products — the seller's own catalogue, every status. */
export async function sellerList(req: Request, res: Response): Promise<void> {
  try {
    const sellerId = actorId(req, res);
    if (!sellerId) return;
    const result = await productService.listSellerProducts(sellerId, req.query);
    res.json({ success: true, ...result });
  } catch (error: any) {
    fail(res, error);
  }
}

/** GET /api/v1/seller/products/:id — includes unapproved listings the seller owns. */
export async function sellerGet(req: Request, res: Response): Promise<void> {
  try {
    const sellerId = actorId(req, res);
    if (!sellerId) return;
    const product = await productService.getProductForOwner(req.params.id, sellerId);
    if (!product) {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }
    res.json({ success: true, data: product });
  } catch (error: any) {
    fail(res, error);
  }
}

/** GET /api/v1/admin/products — moderation queue, defaults to PENDING_APPROVAL. */
export async function adminList(req: Request, res: Response): Promise<void> {
  try {
    const result = await productService.listModerationQueue(req.query);
    res.json({ success: true, ...result });
  } catch (error: any) {
    fail(res, error);
  }
}

/** GET /api/v1/admin/products/counts — per-status totals for the queue badges. */
export async function adminCounts(_req: Request, res: Response): Promise<void> {
  try {
    res.json({ success: true, data: await productService.getModerationCounts() });
  } catch (error: any) {
    fail(res, error);
  }
}

/** GET /api/v1/admin/products/:id — any product, any status. */
export async function adminGet(req: Request, res: Response): Promise<void> {
  try {
    const product = await productService.getProductForOwner(req.params.id);
    if (!product) {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }
    res.json({ success: true, data: product });
  } catch (error: any) {
    fail(res, error);
  }
}

/** PATCH /api/v1/admin/products/:id/moderate — { action: 'approve' | 'reject', reason? } */
export async function moderate(req: Request, res: Response): Promise<void> {
  try {
    const adminId = actorId(req, res);
    if (!adminId) return;
    const product = await productService.moderateProduct(req.params.id, adminId, req.body);
    res.json({ success: true, data: product });
  } catch (error: any) {
    fail(res, error);
  }
}

/**
 * POST /api/v1/admin/search/reindex
 *
 * Rebuilds the search index from the database. Needed after a mapping change,
 * after an Elasticsearch outage (index writes are non-fatal, so products edited
 * while ES was down are simply missing), or on a fresh index.
 *
 * Unlike the endpoint this replaces — search-service's unauthenticated
 * POST /search/reindex, which bulk-wrote whatever `products` array the caller
 * put in the request body — this takes no input at all. The catalogue is the
 * only source; there is nothing here for a caller to inject.
 *
 * Runs synchronously and can take a while on a large catalogue. That is
 * deliberate for now: an admin triggering a rebuild should see the counts,
 * rather than get an immediate 202 and have to guess whether it worked. If the
 * catalogue grows past what a request timeout tolerates, this is the thing to
 * move onto the existing BullMQ queue.
 */
export async function reindexSearch(_req: Request, res: Response): Promise<void> {
  try {
    const result = await productService.reindexAllProducts();
    res.json({
      success: true,
      data:    result,
      message: `Reindexed ${result.indexed} of ${result.total} active products` +
               (result.failed > 0 ? ` (${result.failed} failed — see service logs)` : ''),
    });
  } catch (error: any) {
    fail(res, error);
  }
}
