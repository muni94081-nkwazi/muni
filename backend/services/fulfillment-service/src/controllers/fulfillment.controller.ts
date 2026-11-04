import { Request, Response, NextFunction } from 'express';
import { fulfillmentService, FulfillmentAccessError } from '../services/fulfillment.service.js';
import { CreateFulfillmentSchema } from '../models/fulfillment.model.js';

// ─── Fulfillment controller ───────────────────────────────────────────────────
//
// Every handler here used to take `req.body` or `req.params.id` and act on it
// with no further question asked. `models/fulfillment.model.ts` has defined a
// full Zod schema and a FulfillmentStatusSchema enum the whole time; nothing
// referenced either.
//
// What that allowed, all verified live against this service:
//
//   • a caller claiming ROLE_CUSTOMER created a fulfillment for an order that
//     does not exist, attributed to a seller they named, for 9,999 units of a
//     product that does not exist;
//   • a caller claiming to be seller B marked seller A's parcel DELIVERED —
//     the state that makes seller A's escrow payable;
//   • an invented status reached Prisma, which rejected it with a 400 carrying
//     the repository's absolute file path and source lines.
//
// Identity is now verified upstream by the shared middleware, so res.locals
// carries an actor the caller cannot forge. These handlers add the two things
// identity alone cannot give: whether this actor owns this fulfillment, and
// whether the change they are asking for is one the lifecycle allows.

/** Roles that legitimately see and act on any seller's fulfillment. */
const STAFF_ROLES = ['ROLE_ADMIN', 'ROLE_SUPER_ADMIN', 'ROLE_OPS'];

interface Actor {
  id: string;
  roles: string[];
  isStaff: boolean;
}

/**
 * The acting caller, from the verified identity.
 *
 * Exported so cod.controller.ts builds the actor the same way rather than
 * growing a second definition of "who is asking" that can drift from this one.
 */
export function actorFrom(res: Response): Actor {
  const roles = (res.locals.roles as string[]) ?? [];
  // A peer service booking a delivery job is not a seller and has no seller id
  // to match. requireInternalCaller has already verified a signed assertion
  // carrying a `svc` claim, which only a service can mint, so it stands in the
  // same place staff do: allowed to act for any seller.
  const callingService = res.locals.callingService as string | undefined;
  return {
    id: res.locals.userId as string,
    roles,
    isStaff: Boolean(callingService) || roles.some((r) => STAFF_ROLES.includes(r)),
  };
}

export const createFulfillment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = CreateFulfillmentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ message: 'Invalid fulfillment', errors: parsed.error.flatten().fieldErrors });
      return;
    }

    const actor = actorFrom(res);

    // A seller may only raise a fulfillment against themselves. Staff may raise
    // one for any seller, which is what an ops-side manual booking needs.
    // Previously `sellerId` came from the body and was believed.
    if (!actor.isStaff && parsed.data.sellerId !== actor.id) {
      res.status(403).json({ message: 'A fulfillment can only be created for your own store.' });
      return;
    }

    const f = await fulfillmentService.createFulfillment(parsed.data);
    res.status(201).json({ data: f });
  } catch (e) { next(e); }
};

export const getFulfillment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const f = await fulfillmentService.getOwnedFulfillment(req.params.id, actorFrom(res));
    // 404 rather than 403 on an ownership miss: a 403 confirms the id exists
    // and turns this into an oracle for enumerating other sellers' parcels.
    if (!f) {
      res.status(404).json({ message: 'Not found' });
      return;
    }
    res.json({ data: f });
  } catch (e) { next(e); }
};

export const getOrderFulfillment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Scoped, not filtered client-side: an order's fulfillments span sellers,
    // and a seller must see only their own slice of it.
    const f = await fulfillmentService.getOrderFulfillmentFor(req.params.orderId, actorFrom(res));
    res.json({ data: f });
  } catch (e) { next(e); }
};

// `updateStatus` and `addTrackingNumber` used to be HTTP handlers here. Their
// routes are gone — order-service owns the lifecycle and the tracking number,
// and this service holding a second copy of either is the duplicate authority
// the Stage 8 decision removed.
//
// The corresponding service methods survive: rider.service drives
// `fulfillmentService.updateStatus` as a rider moves a package, and that path
// projects the outcome onto order-service. What is gone is the way for an
// outside caller to set a parcel's status directly.

export const getSellerFulfillment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const f = await fulfillmentService.getSellerFulfillments(res.locals.userId as string);
    res.json({ data: f });
  } catch (e) { next(e); }
};

export { FulfillmentAccessError };
