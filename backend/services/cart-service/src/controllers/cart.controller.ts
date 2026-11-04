import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { cartService } from '../services/cart.service.js';
import { abandonedCartService } from '../services/abandoned-cart.service.js';
import type { z } from 'zod';
import type { AddItemSchema } from '../models/cart.model.js';
import { CartQuantityError } from '../services/cart.service.js';

// Bodies are validated and replaced by route middleware
// (shared/http/validation.middleware), so what arrives here is already
// parsed, coerced and stripped of unknown keys.
type AddItemInput = z.infer<typeof AddItemSchema>;

/** Header a guest sends to claim their cart, and the one we answer with. */
const CART_SESSION_HEADER = 'x-cart-session';

/**
 * Which cart this request owns.
 *
 * Authenticated users are keyed by their real user ID. Anonymous visitors are
 * keyed by the per-browser X-Cart-Session header the frontend generates and
 * persists in localStorage (see axios.config.ts's getOrCreateCartSessionId),
 * prefixed so a guest key can never collide with a real user ID.
 *
 * There used to be a third case: no user and no header fell back to the single
 * literal `'guest'` key — one bucket shared by every such caller on the
 * platform. Verified live: one anonymous caller read another's productId,
 * productName, price, quantity, sellerId and variantId, and could DELETE their
 * lines (204). Any client that omitted the header joined that bucket.
 *
 * Now a missing header means "this guest has no session yet", so one is minted
 * here and returned on the response. There is no shared key left to land in.
 *
 * The user id comes from `res.locals`, where `optionalAuth` puts it after
 * verifying the gateway's signed assertion. It used to read the raw
 * `x-user-id` header FIRST and fall back to res.locals, which meant a
 * hand-written header won against the verified identity: one line of curl read
 * or emptied any signed-in shopper's basket.
 */
function resolveIdentity(req: Request, res: Response): string {
  const userId = res.locals.userId as string | undefined;
  if (userId) return userId;

  const supplied = req.headers[CART_SESSION_HEADER] as string | undefined;
  if (supplied) return `guest:${supplied}`;

  // randomUUID is CSPRNG-backed, so a session id cannot be guessed into.
  // Echoed back on the SAME header the client would have sent, so a caller
  // that stores it addresses the same cart on its next request — which is what
  // keeps this a real cart rather than a per-request one.
  const minted = randomUUID();
  res.setHeader('X-Cart-Session', minted);
  return `guest:${minted}`;
}

export async function getCart(req: Request, res: Response): Promise<void> {
  const userId = resolveIdentity(req, res);
  try {
    const cart = await cartService.getCart(userId);
    res.json({ success: true, data: cart });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function addItem(req: Request, res: Response): Promise<void> {
  const userId = resolveIdentity(req, res);
  try {
    const input = req.body as AddItemInput;
    const cart = await cartService.addItem(userId, input);
    res.status(201).json({ success: true, data: cart });
  } catch (err) {
    // A quantity above what the line allows is the caller's error, not a
    // server fault — and it is refused rather than silently clamped.
    if (err instanceof CartQuantityError) {
      res.status(err.status).json({ success: false, message: err.message });
      return;
    }
    // Validation already passed in middleware, so any other throw here is ours.
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function updateItem(req: Request, res: Response): Promise<void> {
  const userId = resolveIdentity(req, res);
  try {
    const input = req.body as { quantity: number };
    const cart = await cartService.updateItemQuantity(userId, req.params.itemId, input.quantity);
    res.json({ success: true, data: cart });
  } catch (err) {
    // A quantity above what the line allows is the caller's error, not a
    // server fault — and it is refused rather than silently clamped.
    if (err instanceof CartQuantityError) {
      res.status(err.status).json({ success: false, message: err.message });
      return;
    }
    // Validation already passed in middleware, so any other throw here is ours.
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function removeItem(req: Request, res: Response): Promise<void> {
  const userId = resolveIdentity(req, res);
  try {
    const cart = await cartService.removeItem(userId, req.params.itemId);
    res.json({ success: true, data: cart });
  } catch (err) {
    // A quantity above what the line allows is the caller's error, not a
    // server fault — and it is refused rather than silently clamped.
    if (err instanceof CartQuantityError) {
      res.status(err.status).json({ success: false, message: err.message });
      return;
    }
    // Validation already passed in middleware, so any other throw here is ours.
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function clearCart(req: Request, res: Response): Promise<void> {
  const userId = resolveIdentity(req, res);
  try {
    await cartService.clearCart(userId);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function applyCoupon(req: Request, res: Response): Promise<void> {
  const userId = resolveIdentity(req, res);
  try {
    const input = req.body as { code: string };
    const cart = await cartService.applyCoupon(userId, input.code);
    res.json({ success: true, data: cart });
  } catch (err) {
    // A quantity above what the line allows is the caller's error, not a
    // server fault — and it is refused rather than silently clamped.
    if (err instanceof CartQuantityError) {
      res.status(err.status).json({ success: false, message: err.message });
      return;
    }
    // Validation already passed in middleware, so any other throw here is ours.
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function removeCoupon(req: Request, res: Response): Promise<void> {
  const userId = resolveIdentity(req, res);
  try {
    const cart = await cartService.removeCoupon(userId);
    res.json({ success: true, data: cart });
  } catch (err) {
    // A quantity above what the line allows is the caller's error, not a
    // server fault — and it is refused rather than silently clamped.
    if (err instanceof CartQuantityError) {
      res.status(err.status).json({ success: false, message: err.message });
      return;
    }
    // Validation already passed in middleware, so any other throw here is ours.
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

// Called right after login/register: folds whatever the guest was holding
// under their X-Cart-Session into their now-authenticated cart, then clears
// the guest bucket so a later logout+login cycle can't re-merge stale items.
export async function mergeCart(req: Request, res: Response): Promise<void> {
  // requireAuth on the route has already established this; read only what it
  // verified, never the raw header.
  const userId = res.locals.userId as string;
  try {
    const input = req.body as { sessionId: string };
    const guestKey = `guest:${input.sessionId}`;
    const guestCart = await cartService.getCart(guestKey);
    const cart = await cartService.mergeCart(userId, guestCart.items);
    if (guestCart.items.length > 0) {
      await cartService.clearCart(guestKey);
    }
    res.json({ success: true, data: cart });
  } catch (err) {
    // A quantity above what the line allows is the caller's error, not a
    // server fault — and it is refused rather than silently clamped.
    if (err instanceof CartQuantityError) {
      res.status(err.status).json({ success: false, message: err.message });
      return;
    }
    // Validation already passed in middleware, so any other throw here is ours.
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

// ─── Abandoned Cart Recovery Handlers (Phase 15 Feature 4) ────────────────────

export async function getAbandonedCarts(_req: Request, res: Response): Promise<void> {
  try {
    const data = await abandonedCartService.getAbandonedCarts();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

/** Roles that legitimately act on any shopper's abandoned basket. */
const STAFF_ROLES = ['ROLE_ADMIN', 'ROLE_SUPER_ADMIN'];

/**
 * Restore one abandoned basket, from a reminder link.
 *
 * The caller has to be the shopper it belongs to. This took a cartId and
 * restored it for anyone who asked — and answered with the basket's contents
 * and the id of the user who owned it, so it read out a stranger's cart as
 * well as marking it recovered. A miss and someone else's basket answer the
 * same 404, so the ids cannot be probed.
 */
export async function restoreCart(req: Request, res: Response): Promise<void> {
  const callerId = res.locals.userId as string;
  const roles = (res.locals.roles as string[]) ?? [];
  const isStaff = roles.some((r) => STAFF_ROLES.includes(r));

  try {
    const owner = await abandonedCartService.getCartOwner(req.params.cartId);
    if (!owner || !(isStaff || owner === callerId)) {
      res.status(404).json({ success: false, message: 'Abandoned cart not found' });
      return;
    }

    const cart = await abandonedCartService.restoreCart(req.params.cartId);
    if (!cart) {
      res.status(404).json({ success: false, message: 'Abandoned cart not found' });
      return;
    }
    res.json({ success: true, data: cart, message: 'Cart successfully restored' });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function getRecoveryStats(_req: Request, res: Response): Promise<void> {
  try {
    const data = await abandonedCartService.getRecoveryStats();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}
