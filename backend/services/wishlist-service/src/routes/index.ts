import { Router } from 'express';
import * as controller from '../controllers/wishlist.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

// ─── Wishlist routes ──────────────────────────────────────────────────────────
//
// Two routers, because this service serves two different path shapes.
//
// `wishlistRouter` holds the wishlist resource itself and is mounted under
// /api/v1/wishlists by app.ts. It used to be mounted at the root with its paths
// written relative ('/', '/:id/items'), which meant the only requests that
// reached it were ones sent to '/' — and the gateway forwards req.originalUrl
// unchanged, so every real call to /api/v1/wishlists arrived as a 404. The web
// and mobile clients both call that path, so the whole wishlist API was
// unreachable in practice.
//
// `standaloneRouter` holds the price-alert and price-history endpoints, which
// already carry their own absolute /api/v1/... paths and are a different
// resource. They stay mounted at the root so those paths do not change.
//
// requireAuth is applied to every route that reads or writes ONE user's data.
// It was written but never wired to anything, which left the controllers
// falling back to a hardcoded 'user-123' for any request without an identity.

export const wishlistRouter = Router();

// The caller's own wishlists.
wishlistRouter.post('/', requireAuth, controller.createWishlist);
wishlistRouter.get('/', requireAuth, controller.getUserWishlists);

// Deliberately public: getPublicWishlist filters on isPublic, so this returns
// nothing unless the owner shared it. Adding requireAuth here would break
// shared-wishlist links, which are meant to be openable by anyone.
wishlistRouter.get('/:id', controller.getWishlistById);

wishlistRouter.post('/:id/items', requireAuth, controller.addItem);
wishlistRouter.delete('/:id/items/:itemId', requireAuth, controller.removeItem);

// Sharing and collaboration — all act on a wishlist the caller must own.
wishlistRouter.post('/:id/share', requireAuth, controller.generateShareLink);
wishlistRouter.post('/:id/collaborators', requireAuth, controller.addCollaborator);
wishlistRouter.delete('/:id/collaborators/:userId', requireAuth, controller.removeCollaborator);
wishlistRouter.post('/:id/copy', requireAuth, controller.copyWishlist);

// Redeeming a share token is public by design — the token is the credential.
wishlistRouter.post('/shared/:token/view', controller.getSharedWishlistByToken);

export const standaloneRouter = Router();

standaloneRouter.post('/api/v1/price-alerts', requireAuth, controller.setPriceAlert);
standaloneRouter.get('/api/v1/price-alerts', requireAuth, controller.listPriceAlerts);
standaloneRouter.delete('/api/v1/price-alerts/:id', requireAuth, controller.deletePriceAlert);
standaloneRouter.put('/api/v1/price-alerts/:id', requireAuth, controller.updatePriceAlert);

// Price history is catalogue data, not user data.
standaloneRouter.get('/api/v1/products/:id/price-history', controller.getPriceHistory);

/**
 * @deprecated Kept so any existing import of `router` keeps compiling. New
 * mounts should use the two named routers above.
 */
export const router = standaloneRouter;
