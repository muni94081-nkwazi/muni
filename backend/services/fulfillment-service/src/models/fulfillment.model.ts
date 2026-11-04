import { z } from 'zod';

export const FulfillmentTypeSchema = z.enum(['SELLER_FULFILLED', 'WAREHOUSE', 'THIRD_PARTY_LOGISTICS']);
export const FulfillmentStatusSchema = z.enum([
  'PENDING', 'ASSIGNED', 'PICKING', 'PACKED', 'HANDED_TO_CARRIER',
  // Rider App lifecycle (see rider.model.ts)
  'PICKED_UP', 'IN_TRANSIT', 'DELIVERED_COD', 'RETURNED',
  'DELIVERED', 'FAILED',
]);
export const PaymentMethodSchema = z.enum(['PREPAID', 'COD']);
export const CodVerificationStatusSchema = z.enum(['PENDING', 'VERIFIED', 'SHORT', 'DISPUTED']);

export const FulfillmentSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  subOrderId: z.string().optional(),
  sellerId: z.string(),
  type: FulfillmentTypeSchema,
  provider: z.string().optional(),
  warehouseId: z.string().optional(),
  warehouseLocation: z.string().optional(),
  status: FulfillmentStatusSchema.default('PENDING'),
  items: z.array(z.object({
    productId: z.string(),
    variantId: z.string().optional(),
    quantity: z.number(),
    weight: z.number().optional(),
    dimensions: z.object({ l: z.number(), w: z.number(), h: z.number() }).optional()
  })),
  shippingAddress: z.any(),
  trackingNumber: z.string().optional(),
  estimatedDelivery: z.string().optional(),
  timeline: z.array(z.object({
    status: z.string(),
    timestamp: z.string(),
    note: z.string().optional()
  })),
  // Cash-on-Delivery
  paymentMethod: PaymentMethodSchema.default('PREPAID'),
  codAmountDue: z.number().optional(),
  codAmountCollected: z.number().optional(),
  codCurrency: z.string().optional(),
  codStatus: CodVerificationStatusSchema.optional(),
  // Delivery Rider App
  riderId: z.string().optional(),
  signatures: z.array(z.object({
    id: z.string(),
    riderId: z.string(),
    signatureData: z.string(),
    recipientName: z.string(),
    capturedAt: z.string(),
  })).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Fulfillment = z.infer<typeof FulfillmentSchema>;

// ─── Request shapes ───────────────────────────────────────────────────────────
//
// The schemas above described what is STORED. Nothing described what may be
// SENT, so the controller passed `req.body` through untouched and Prisma was
// the first thing to object — which is why an invented status came back as a
// 400 quoting a repository file path.
//
// Derived from FulfillmentSchema rather than restated, so a field added to the
// stored shape cannot drift from the accepted one. Every field the server
// decides for itself — id, type, provider, status, timeline, timestamps — is
// omitted, so a caller cannot pre-set them.

export const CreateFulfillmentSchema = FulfillmentSchema.pick({
  orderId:  true,
  sellerId: true,
  items:    true,
}).extend({
  subOrderId:        FulfillmentSchema.shape.subOrderId,
  warehouseId:       FulfillmentSchema.shape.warehouseId,
  warehouseLocation: FulfillmentSchema.shape.warehouseLocation,
  shippingAddress:   FulfillmentSchema.shape.shippingAddress,
  estimatedDelivery: FulfillmentSchema.shape.estimatedDelivery,
  paymentMethod:     PaymentMethodSchema.optional(),
  codAmountDue:      FulfillmentSchema.shape.codAmountDue,
  codCurrency:       FulfillmentSchema.shape.codCurrency,
}).strict();

export type CreateFulfillmentInput = z.infer<typeof CreateFulfillmentSchema>;

export const UpdateStatusSchema = z.object({
  status: FulfillmentStatusSchema,
}).strict();

export const AddTrackingSchema = z.object({
  trackingNumber: z.string().trim().min(1, 'A tracking number is required').max(128),
}).strict();

// ─── Which status may follow which ────────────────────────────────────────────
//
// There was no rule: `updateStatus` assigned whatever arrived, so a parcel
// could go straight from PENDING to DELIVERED, or back again. DELIVERED is the
// state a seller's escrow release is keyed off, so a free jump to it is a free
// payout for goods still on a shelf.
//
// The lane below is the path a real consignment takes through this service's
// own vocabulary. DELIVERED_COD is the cash-on-delivery terminal, reached from
// the same points as DELIVERED. FAILED and RETURNED are the unhappy endings,
// reachable only once something is actually in motion.
// Reachable at any point before a terminal state, because a parcel can go
// wrong at any point: rider.service demands a returnReason for RETURNED, and a
// verified cash collection for DELIVERED_COD, so neither is a free move.
const UNHAPPY = ['DELIVERED_COD', 'RETURNED', 'FAILED'] as const;

export const FULFILLMENT_TRANSITIONS: Record<FulfillmentStatus, readonly FulfillmentStatus[]> = {
  // PICKED_UP is reachable from each of these because a rider may claim a
  // package in any of them — rider.service's CLAIMABLE_STATUSES is the existing
  // rule, and claiming does not itself move the status, so the pickup that
  // follows arrives from wherever the package already was.
  //
  // What is deliberately absent from the first four rows is plain DELIVERED.
  // That is the one transition nothing else guards, and it is the one that
  // makes a seller's escrow payable — so it is reachable only once the parcel
  // has demonstrably left: handed to a carrier, picked up, or in transit.
  // Before this there was no table at all and PENDING → DELIVERED was a single
  // unauthenticated PATCH.
  PENDING:           ['ASSIGNED', 'PICKING', 'PACKED', 'HANDED_TO_CARRIER', 'PICKED_UP', ...UNHAPPY],
  ASSIGNED:          ['PICKING', 'PACKED', 'HANDED_TO_CARRIER', 'PICKED_UP', ...UNHAPPY],
  PICKING:           ['PACKED', 'HANDED_TO_CARRIER', 'PICKED_UP', ...UNHAPPY],
  PACKED:            ['HANDED_TO_CARRIER', 'PICKED_UP', ...UNHAPPY],

  HANDED_TO_CARRIER: ['PICKED_UP', 'IN_TRANSIT', 'DELIVERED', ...UNHAPPY],
  PICKED_UP:         ['IN_TRANSIT', 'DELIVERED', ...UNHAPPY],
  IN_TRANSIT:        ['DELIVERED', ...UNHAPPY],

  // Terminal. A delivered parcel that comes back is a return, which is
  // return-service's lifecycle, not another hop through this one.
  DELIVERED:         [],
  DELIVERED_COD:     [],
  RETURNED:          [],
  FAILED:            [],
};

export type FulfillmentStatus = z.infer<typeof FulfillmentStatusSchema>;

/** Whether this service recognises `value` as a status at all. */
export function isFulfillmentStatus(value: unknown): value is FulfillmentStatus {
  return typeof value === 'string' && Object.hasOwn(FULFILLMENT_TRANSITIONS, value);
}
