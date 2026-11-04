import { Router } from 'express';
import { createFulfillment, getFulfillment, getOrderFulfillment, getSellerFulfillment } from '../controllers/fulfillment.controller.js';
import { requireAuth, requireRole, requireInternalCaller } from '../middleware/auth.middleware.js';
import riderRoutes from './rider.routes.js';
import codRoutes from './cod.routes.js';

// ─── Routes ───────────────────────────────────────────────────────────────────
//
// order-service owns the fulfillment lifecycle; this service owns the delivery
// job behind it — the rider, the signature, the cash. See "Decision: who owns
// the fulfillment lifecycle" in docs/Architecture_Diagram.md.
//
// Two routes are deliberately gone:
//
//   PATCH /fulfillment/:id/status   — the duplicate lifecycle. A parcel's
//     status is the sub-order's, and moving it here left the customer, the
//     seller, payment-service's settlement and return-service's delivery
//     window all reading the other one. Riders move a job through
//     /rider/packages/:id/status, which projects onto order-service.
//
//   POST /fulfillment/:id/tracking  — tracking belongs to the sub-order, which
//     is where all three frontends already read it.
//
// Neither was reachable through the gateway and no client ever called them.

const router = Router();

// Creating a delivery job is an internal act: checkout or an ops process books
// one against a sub-order that already exists. It was requireAuth, which let
// any authenticated caller invent a job for any seller.
router.post('/fulfillment', requireInternalCaller, createFulfillment);

router.get('/fulfillment/:id', requireAuth, getFulfillment);
router.get('/fulfillment/order/:orderId', requireAuth, getOrderFulfillment);
router.get('/seller/fulfillment', requireAuth, requireRole('ROLE_SELLER'), getSellerFulfillment);

router.use(riderRoutes);
router.use(codRoutes);

export default router;
