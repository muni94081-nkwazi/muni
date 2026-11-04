import { Router, type RequestHandler } from 'express';
import { proxy }       from '../utils/proxy.js';
import { requireAuth } from '../middleware/auth.middleware.js';

// ─── Customer Routes ───────────────────────────────────────────────────────────
//
// Public routes (no auth required):
//   /auth, /products, /categories, /brands, /containers, /search,
//   /recommendations, /marketplace, /currencies, /discounts/active, /cart,
//   /newsletter,
//   /reviews, /sellers (trust score)
//
// Protected routes (requireAuth → 401 if no valid JWT):
//   /users, /addresses, /checkout, /orders, /payments, /shipping, /notifications,
//   /wishlists, /returns, /disputes, /media, /fulfillment, /support, /tax, /chat
//
// /cart is deliberately public: cart-service supports both authenticated
// users (x-user-id, stamped by optionalAuth below when a JWT is present)
// and anonymous guests (X-Cart-Session header) so guests can add to cart
// before signing in. Checkout itself stays behind requireAuth — that's the
// actual auth gate in the purchase flow.

export function customerRoutes(targets: Record<string, string>): Router {
  const router = Router();

  // These mounts used to carry `targets.x || 'http://localhost:PORT'` fallbacks.
  // Inside a container localhost is the container itself, so a missing target
  // surfaced as an opaque connection error on the first request rather than as
  // a configuration problem. Failing at startup names the offending route.
  function requireTarget(prefix: string, target: string | undefined): string {
    if (!target) {
      throw new Error(
        `[gateway] No upstream configured for "${prefix}". Add it to the targets map in gateway.ts and set its *_SERVICE_URL env var.`,
      );
    }
    return target;
  }

  /** Mount a route that passes directly to the resilient proxy */
  function pub(prefix: string, target: string): void {
    const upstream = requireTarget(prefix, target);
    router.use(prefix, (req, res, next) => proxy(req, res, upstream).catch(next));
  }

  /**
   * Mount a PUBLIC, READ-ONLY route: GET and HEAD reach the service, every
   * other method is refused at the edge with 405.
   *
   * `pub()` above mounts with router.use, which forwards every method. That is
   * right for prefixes that genuinely take public writes — /auth takes the
   * login POST, /cart takes a guest's add-to-cart — but wrong for a prefix that
   * should only ever be read from.
   *
   * /search is the case that proved it. search-service exposed
   * POST /api/v1/search/reindex on that public prefix, unauthenticated, and it
   * bulk-wrote whatever `products` array the caller supplied into the live
   * storefront index. Anyone who could reach the gateway could put arbitrary
   * documents in front of shoppers, or overwrite real listings with their own.
   *
   * That endpoint is gone, so today the protection is that no POST route exists
   * behind the prefix any more. This makes it a property of the mount instead:
   * the next write route added under /search is refused by default rather than
   * published by default.
   */
  function pubReadOnly(prefix: string, target: string): void {
    const upstream = requireTarget(prefix, target);
    router.use(prefix, (req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.status(405)
          .set('Allow', 'GET, HEAD')
          .json({
            success: false,
            data:    null,
            error:   {
              code:    'METHOD_NOT_ALLOWED',
              message: `${req.method} is not allowed on ${prefix}. This prefix is read-only.`,
            },
            meta: {
              correlationId: req.headers['x-correlation-id'] ?? null,
              timestamp:     new Date().toISOString(),
              service:       'api-gateway',
            },
          });
        return;
      }
      proxy(req, res, upstream).catch(next);
    });
  }

  /** Mount a route protected by JWT authentication */
  function auth(prefix: string, target: string): void {
    const upstream = requireTarget(prefix, target);
    router.use(prefix, requireAuth as RequestHandler, (req, res, next) =>
      proxy(req, res, upstream).catch(next),
    );
  }

  // ── Public ──────────────────────────────────────────────────────────────
  pub('/auth',              targets.auth);           // login, register, refresh, OAuth
  pub('/products',          targets.product);
  pub('/categories',        targets.product);
  pub('/containers',        targets.containers);       // → container-service (homepage merchandising)
  pub('/brands',            targets.product);
  // → product-service, which owns the muni-products index.
  //
  // This pointed at search-service, and both services were writing the SAME
  // index (`muni-products`) with DIFFERENT mappings — search-service using
  // `price`/`rating`/`stock`, product-service using `basePrice`/`averageRating`.
  // Whichever booted first created the index, so the other's documents and
  // queries silently disagreed with the mapping and matched nothing.
  //
  // Worse, search-service seeded 12 invented demo products into that index on
  // boot whenever it was empty, so a shopper searching "coffee" could be shown
  // a "Kampala Premium Coffee" that exists in no database and cannot be bought.
  //
  // One writer, one reader, one mapping. product-service already exposes
  // GET /api/v1/search (app.ts) and its listProducts() routes text queries to
  // Elasticsearch with a SQL fallback when ES is down.
  // Read-only, and public on purpose: a signed-out shopper searching the
  // catalogue is the single most common request the storefront serves, so this
  // prefix cannot move behind requireAuth. It is the WRITE side that had to go
  // — see pubReadOnly above, and the admin reindex mount in admin.routes.ts.
  pubReadOnly('/search',    targets.product);
  pub('/recommendations',   targets.recommendation);
  pub('/sellers/register',  targets.auth);            // seller self-registration (public)
  pub('/marketplace',       targets.marketplace);     // public storefront browsing
  pub('/currencies',        targets.currency);        // exchange rates
  pub('/discounts/active',  targets.discount);        // public flash sales
  pub('/discounts/flash-sales', targets.discount);
  pub('/tax/rates',         targets.tax);             // tax rate lookup
  // ── Buyer protection ───────────────────────────────────────────────────────
  //
  // Split, for the same reason /loyalty is. The whole prefix was mounted with
  // pub() — every method, no JWT — and buyer-protection-service had no guards
  // of its own, so the escrow endpoints that freeze and release a seller's
  // payout, the claims queue, and the admin resolve route were all reachable
  // unauthenticated. The service resolved the caller from x-user-id, falling
  // back to the request body and then to a hardcoded 'user-123'.
  //
  // What stays public is what a signed-out shopper reads on a product page: the
  // policy and the protection badge, GET only. Eligibility is a stateless
  // calculator over the values in the request body — it reads nothing and
  // returns nothing stored — so it keeps its existing public contract.
  // Ordering matters: Express matches mounts in registration order, so these
  // must precede the authenticated catch-all.
  pubReadOnly('/buyer-protection/policy', targets.buyerProtection);
  pubReadOnly('/buyer-protection/badge',  targets.buyerProtection);
  pub('/buyer-protection/check-eligibility', targets.buyerProtection);
  auth('/buyer-protection', targets.buyerProtection); // claims + escrow
  // ── Advertising ────────────────────────────────────────────────────────────
  //
  // Split, like /loyalty and /buyer-protection above. The whole prefix was
  // pub() — every method, no JWT — over a service that had no guards of its
  // own, so campaign creation and seller ad analytics were reachable
  // unauthenticated, and the service resolved the seller from x-user-id
  // falling back to the request body and then to a hardcoded 'seller-001'.
  //
  // Public: the two a signed-out shopper needs. Sponsored placements render on
  // product pages, and customer-web posts a click from the browser when one is
  // clicked (SponsoredProductCard.tsx:32) — often with no session at all.
  pubReadOnly('/advertising/sponsored-products', targets.advertising);
  pub('/advertising/clicks',                     targets.advertising);
  auth('/advertising',                           targets.advertising); // campaigns + analytics
  pub('/seller-education',  targets.sellerEducation); // seller onboarding & courses
  // ── Loyalty ────────────────────────────────────────────────────────────────
  //
  // Split, because one prefix serves two different kinds of data.
  //
  // The reward catalogue and the tier benefits table are the same for every
  // shopper and are read before signing in, so they stay public — but as
  // pubReadOnly, so a write route added under either path later is refused by
  // default instead of published by default.
  //
  // Everything else under /loyalty reads or spends ONE user's balance. It was
  // mounted with pub(), which forwards every method with no authentication, and
  // loyalty-service then took the caller from "userId" in the request body,
  // falling back to a hardcoded 'user-123'. Naming another user in the body was
  // enough to redeem their rewards. requireAuth now runs at the edge, and the
  // service reads only the signed identity this stamps.
  //
  // Order matters: Express matches in registration order, so the two public
  // paths must be mounted before the catch-all.
  pubReadOnly('/loyalty/rewards',       targets.loyalty);
  pubReadOnly('/loyalty/tier/benefits', targets.loyalty);
  auth('/loyalty',                      targets.loyalty);

  // ── Q&A ────────────────────────────────────────────────────────────────────
  //
  // Deliberately NOT mounted. qa-service serves /api/v1/products/:id/questions,
  // /api/v1/questions/:id, /api/v1/answers/... and /api/v1/seller/questions —
  // none of which begin with /qa. The proxy forwards req.originalUrl unchanged
  // (see utils/proxy.ts), so everything sent to /api/v1/qa/* reached the service
  // as /api/v1/qa/* and 404'd: this prefix has never served a request.
  //
  // Mounting it as pub() therefore published nothing, but it did advertise an
  // unauthenticated all-methods entry point into a service whose writes are now
  // guarded. Removing the dead mount is the honest state until the routing is
  // designed properly, which is tracked as its own task. qa-service enforces
  // requireAuth / requireRole('ROLE_SELLER') on its own writes regardless, so it
  // is safe from anything already inside the cluster.
  // ── Dynamic pricing ────────────────────────────────────────────────────────
  //
  // Moved off pub(). This was every method with no JWT onto a service that had
  // no guards of its own, so POST /pricing/rules and POST /pricing/apply were
  // unauthenticated writes onto what sellers' products sell for, and
  // GET /pricing/rules?sellerId= handed out competitors' price floors.
  //
  // Nothing under it is public: shoppers read prices from product-service, not
  // from the rule engine that sets them.
  auth('/pricing',          targets.pricing); // dynamic pricing engine
  // NOTE: /wholesale is mounted under "Protected" below. Bulk tier pricing is
  // negotiated B2B pricing, not public catalogue data, and placing a bulk order
  // needs a verified buyer — it was `pub()` here, reachable with no auth at all.
  // ── Tracking ───────────────────────────────────────────────────────────────
  //
  // Also deliberately not mounted, and for the same reason: this pointed at
  // shipping-service, which has no /api/v1/tracking route. Its tracking endpoint
  // is GET /api/v1/shipping/track/:trackingNumber, already reached through the
  // authenticated /shipping mount below. So /tracking was a dead prefix that
  // only widened the unauthenticated surface. Restoring a real tracking API —
  // including whether a guest should be able to track by number — is a separate
  // piece of work.
  // Newsletter signup is deliberately public — the footer form must work for a
  // signed-out visitor, which is the overwhelmingly common case. The service
  // rate-limits per IP itself, and optionalAuth above stamps x-user-id when a
  // JWT happens to be present so a signed-in signup is attributed.
  pub('/newsletter',        targets.newsletter);
  pub('/cart',              targets.cart);              // → cart-service; supports guest + authenticated carts
  // Reading reviews must work signed-out — a product page renders them to every
  // visitor. Writing does not: optionalAuth above stamps x-user-id when a JWT
  // is present, and review-service rejects unidentified writes itself. Same
  // arrangement as /cart.
  pub('/reviews',           targets.review);

  // ── Protected (requires valid JWT) ───────────────────────────────────────
  //
  // Ordering matters: Express matches router.use() prefixes in registration
  // order, so a path owned by a more specific service must be mounted before
  // the broader prefix that would otherwise swallow it.
  //
  // /users is split deliberately. auth-service owns identity (/users/me,
  // change-password, 2FA, GDPR export); user-service owns the address book and
  // notification preferences. Splitting on the sub-path keeps both URLs
  // RESTful rather than inventing a /preferences top-level prefix.
  auth('/users/me/preferences', targets.user);       // → user-service (channel opt-ins)
  auth('/users',         targets.auth);              // profile, identity, 2FA, GDPR
  auth('/addresses',     targets.user);              // → user-service (saved address book)
  auth('/sellers/me',    targets.auth);              // seller: own profile + documents
  auth('/checkout',      targets.checkout);          // → checkout-service (saga)
  auth('/orders',        targets.order);
  auth('/wholesale',     targets.wholesale);         // → order-service (bulk tiers + orders)
  auth('/payments',      targets.payment);
  auth('/shipping',      targets.shipping);
  auth('/notifications', targets.notification);
  auth('/wishlists',     targets.wishlist);
  // Conversations are private to their two parties. This was mounted with
  // pub() — no JWT at all — while chat-service itself resolved the caller from
  // a client-supplied header, so any conversation was readable by anyone.
  auth('/chat',          targets.chat);
  auth('/returns',       targets.returns);
  auth('/disputes',      targets.dispute);
  // Stored images, readable by anyone — a product photo has to render for a
  // signed-out shopper, and these are content-addressed filenames rather than
  // enumerable ids. Registered BEFORE auth('/media') because express matches
  // mounts in order and '/media' would otherwise swallow this sub-path, putting
  // every product image behind a login.
  //
  // Read-only: uploads still go through the authenticated POST below.
  pubReadOnly('/media/uploads', targets.media);

  auth('/media',         targets.media);             // file uploads
  auth('/tax/calculate', targets.tax);               // tax calculation during checkout
  auth('/support',       targets.support);           // helpdesk tickets (buyer + seller)
  auth('/tax/invoices',  targets.tax);               // buyer's own tax invoices
  auth('/discounts/validate', targets.discount);
  auth('/discounts/apply',    targets.discount);

  // Seller trust score, badges and performance scorecard. Registered last so
  // the narrower /sellers/register (public) and /sellers/me (auth-service)
  // mounts above keep priority; everything else under /sellers falls through
  // to user-service, which owns SellerTrustStats.
  pub('/sellers',        targets.user);              // → user-service (trust score, scorecard)

  return router;
}
