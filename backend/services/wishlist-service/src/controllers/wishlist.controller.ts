import type { Request, Response } from 'express';
import { wishlistService } from '../services/wishlist.service.js';
import { priceAlertService } from '../services/price-alert.service.js';
import { wishlistShareService } from '../services/wishlist-share.service.js';
import { createWishlistSchema, addWishlistItemSchema } from '../models/wishlist.model.js';

/**
 * The authenticated caller, and the only accepted source of identity.
 *
 * Each handler used to resolve its actor as
 *   req.headers['x-user-id'] || res.locals.userId || 'user-123'
 * so any request that arrived without an identity operated as a single shared
 * fake account — and the raw header was trusted ahead of the value requireAuth
 * publishes. requireAuth now runs on every user-scoped route (see routes/),
 * verifies the gateway-stamped identity and puts it in res.locals.userId, so
 * that is what these handlers read.
 *
 * Ownership itself is enforced a layer down: wishlistService.addItem and
 * removeItem look the wishlist up by (userId, wishlistId) and throw when it is
 * not the caller's, which is what stops one customer touching another's list.
 */
function actingUser(res: Response): string {
  const userId = res.locals.userId as string | undefined;
  if (!userId) throw new Error("actingUser called on a route that is not behind requireAuth");
  return userId;
}

export async function createWishlist(req: Request, res: Response): Promise<void> {
  const userId = actingUser(res);
  try {
    const input = createWishlistSchema.parse(req.body);
    const wishlist = await wishlistService.createWishlist(userId, input);
    res.status(201).json({ success: true, data: wishlist });
  } catch (err) {
    res.status(400).json({ success: false, message: (err as Error).message });
  }
}

export async function getUserWishlists(req: Request, res: Response): Promise<void> {
  const userId = actingUser(res);
  try {
    const wishlists = await wishlistService.getWishlistsByUser(userId);
    res.json({ success: true, data: wishlists });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function getWishlistById(req: Request, res: Response): Promise<void> {
  try {
    const wishlist = await wishlistService.getPublicWishlist(req.params.id);
    if (!wishlist) {
      res.status(404).json({ success: false, message: 'Wishlist not found' });
      return;
    }
    res.json({ success: true, data: wishlist });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function addItem(req: Request, res: Response): Promise<void> {
  const userId = actingUser(res);
  try {
    const input = addWishlistItemSchema.parse(req.body);
    const wishlist = await wishlistService.addItem(userId, req.params.id, input);
    res.json({ success: true, data: wishlist });
  } catch (err) {
    res.status(400).json({ success: false, message: (err as Error).message });
  }
}

export async function removeItem(req: Request, res: Response): Promise<void> {
  const userId = actingUser(res);
  try {
    const wishlist = await wishlistService.removeItem(userId, req.params.id, req.params.itemId);
    res.json({ success: true, data: wishlist });
  } catch (err) {
    res.status(400).json({ success: false, message: (err as Error).message });
  }
}

// ─── Price Alert Controller Handlers (Phase 15 Feature 2) ─────────────────────

export async function setPriceAlert(req: Request, res: Response): Promise<void> {
  const userId = actingUser(res);
  const { productId, productName, targetPrice, currentPrice } = req.body;

  if (!productId || !targetPrice) {
    res.status(400).json({ success: false, message: 'productId and targetPrice are required' });
    return;
  }

  try {
    const data = await priceAlertService.setPriceAlert(userId, productId, productName || 'Product', targetPrice, currentPrice);
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function listPriceAlerts(req: Request, res: Response): Promise<void> {
  const userId = actingUser(res);
  try {
    const data = await priceAlertService.listUserAlerts(userId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function deletePriceAlert(req: Request, res: Response): Promise<void> {
  try {
    await priceAlertService.deleteAlert(req.params.id);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function updatePriceAlert(req: Request, res: Response): Promise<void> {
  const { targetPrice } = req.body;
  try {
    const data = await priceAlertService.updateAlert(req.params.id, targetPrice);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function getPriceHistory(req: Request, res: Response): Promise<void> {
  try {
    const data = await priceAlertService.getPriceHistory(req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

// ─── Wishlist Sharing & Social Collaboration Handlers (Phase 15 Feature 3) ────

export async function generateShareLink(req: Request, res: Response): Promise<void> {
  const { permission } = req.body;
  try {
    const data = await wishlistShareService.generateShareLink(req.params.id, permission);
    res.json({
      success: true,
      data,
      shareUrl: `https://muni.ug/wishlist/shared/${data.shareToken}`,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function getSharedWishlistByToken(req: Request, res: Response): Promise<void> {
  const { token } = req.params;
  try {
    const share = await wishlistShareService.getSharedWishlistByToken(token);
    if (!share) {
      res.status(404).json({ success: false, message: 'Invalid or expired wishlist share link' });
      return;
    }

    const wishlist = await wishlistService.getPublicWishlist(share.wishlistId);
    res.json({ success: true, data: { share, wishlist } });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function addCollaborator(req: Request, res: Response): Promise<void> {
  const { userId, email, permission } = req.body;
  try {
    const data = await wishlistShareService.addCollaborator(req.params.id, userId, email, permission);
    res.status(201).json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function removeCollaborator(req: Request, res: Response): Promise<void> {
  try {
    await wishlistShareService.removeCollaborator(req.params.id, req.params.userId);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function copyWishlist(req: Request, res: Response): Promise<void> {
  const userId = actingUser(res);
  try {
    const original = await wishlistService.getPublicWishlist(req.params.id);
    if (!original) {
      res.status(404).json({ success: false, message: 'Wishlist not found' });
      return;
    }
    const cloned = await wishlistShareService.copyWishlist(original, userId);
    res.status(201).json({ success: true, data: cloned });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}
