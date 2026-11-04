import { Request, Response, NextFunction } from 'express';
import { marketplaceService } from '../services/marketplace.service.js';
import { CreateStoreSchema } from '../models/marketplace.model.js';

/**
 * What a shopper is allowed to see of a store.
 *
 * The public endpoints returned the whole row, which carries `commissionRate` —
 * the cut MUNI takes from that seller. That is a commercial term between the
 * marketplace and the seller, and it was readable by anyone who opened a
 * storefront. Listing the public fields explicitly rather than deleting the
 * private ones means a column added to the model later is private by default.
 *
 * `userId` stays: it is the key products are filed under, and product-service
 * already returns `sellerId` on every public product, so it is not a new
 * disclosure — the storefront needs it to ask for that seller's catalogue.
 */
function toPublicStore(store: Record<string, unknown>) {
  return {
    id:                 store.id,
    userId:             store.userId,
    storeName:          store.storeName,
    storeSlug:          store.storeSlug,
    description:        store.description,
    logo:               store.logo,
    banner:             store.banner,
    categories:         store.categories,
    location:           store.location,
    rating:             store.rating,
    reviewCount:        store.reviewCount,
    totalSales:         store.totalSales,
    verificationStatus: store.verificationStatus,
    joinedAt:           store.joinedAt,
  };
}

/** Only a live store is a storefront. */
const isPubliclyVisible = (store: { status?: unknown }) => store.status === 'ACTIVE';

export const getStores = async (_req: Request, res: Response) => {
  const stores = await marketplaceService.getStores();
  res.json({
    success: true,
    data: (stores as Array<Record<string, unknown>>).filter(isPubliclyVisible).map(toPublicStore),
  });
};

export const getStoreBySlug = async (req: Request, res: Response) => {
  const store = await marketplaceService.getStoreBySlug(req.params.slug);

  // A suspended or closed store answered exactly like a live one, so a shopper
  // could still browse it from a saved link. Answering 404 for both "no such
  // store" and "not trading" also avoids confirming that a suspended store
  // exists.
  if (!store || !isPubliclyVisible(store)) {
    return res.status(404).json({ success: false, message: 'Store not found' });
  }

  res.json({ success: true, data: toPublicStore(store as unknown as Record<string, unknown>) });
};

export const getMyStore = async (_req: Request, res: Response) => {
  const userId = res.locals.userId || 'u-101';
  const store = await marketplaceService.getMyStore(userId);
  if (!store) return res.status(404).json({ success: false, message: 'Store not found' });
  res.json({ success: true, data: store });
};

export const createStore = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = res.locals.userId || 'u-101';
    // Validated before anything reaches Prisma. Without this a body missing
    // `location` produced a Prisma rejection that no one caught, and the
    // process exited — see CreateStoreSchema.
    const input = CreateStoreSchema.parse(req.body);
    const store = await marketplaceService.createStore(userId, input);
    res.status(201).json({ success: true, data: store });
  } catch (err) {
    // Express 4 does not forward a throw from an async handler, so it has to be
    // handed over explicitly; otherwise it becomes an unhandled rejection.
    next(err);
  }
};

export const updateStore = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId || 'u-101';
    const store = await marketplaceService.updateStore(userId, req.body);
    res.json({ success: true, data: store });
  } catch (e: any) {
    res.status(400).json({ success: false, message: e.message });
  }
};

export const getStoreTrustBadges = async (req: Request, res: Response) => {
  const { id } = req.params;
  const badges = await marketplaceService.getStoreTrustBadges(id);
  res.json({ success: true, data: badges });
};

export const getProductTrustBadges = async (req: Request, res: Response) => {
  const { id } = req.params;
  const badges = await marketplaceService.getProductTrustBadges(id);
  res.json({ success: true, data: badges });
};

/**
 * Who may read a seller's tier.
 *
 * The tier payload is commercial: totalOrders, totalRevenueUGX, the seller's
 * commission-fee reduction and their search-boost multiplier. Both routes were
 * mounted with no guard at all, and the gateway serves /marketplace publicly —
 * so an anonymous request returned a named seller's real sales volume, derived
 * revenue and commission terms. Verified live before this fix: a real store's
 * rating 4.9 / 140 orders / UGX 35,000,000 came back with no credentials.
 *
 * The seller themselves and an admin may read it. Nothing else: no client in
 * this repository consumes the endpoint, so nothing depended on it being open.
 */
function tierViewerFor(sellerId: string, res: Response): string | null {
  const actor = res.locals.userId as string | undefined;
  if (!actor) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return null;
  }

  const roles = (res.locals.roles as string[] | undefined) ?? [];
  const isAdmin = roles.includes('ROLE_ADMIN') || roles.includes('ROLE_SUPER_ADMIN');
  if (sellerId !== actor && !isAdmin) {
    res.status(403).json({ success: false, message: 'You may only view your own seller tier' });
    return null;
  }

  return sellerId;
}

export const getSellerTier = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // No 'seller-001' fallback: an unidentified caller is refused, not served
    // somebody else's figures under a hardcoded id.
    const sellerId = tierViewerFor(req.params.sellerId, res);
    if (!sellerId) return;

    const tierDetails = await marketplaceService.getSellerTier(sellerId);
    res.json({ success: true, data: tierDetails });
  } catch (err) {
    next(err);
  }
};

export const evaluateSellerTier = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // The body no longer chooses whose tier is read. It used to, which let any
    // caller name any seller.
    const sellerId = tierViewerFor(
      (req.body?.sellerId as string) ?? (res.locals.userId as string),
      res,
    );
    if (!sellerId) return;

    const tierDetails = await marketplaceService.getSellerTier(sellerId);
    res.json({ success: true, data: tierDetails, message: `Seller tier evaluated: ${tierDetails.currentTier}` });
  } catch (err) {
    next(err);
  }
};
