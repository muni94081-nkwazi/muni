import { z } from 'zod';

/**
 * The delivery address, as the clients actually send it and as order-service
 * actually requires it.
 *
 * This used to be `z.any()` on the session and nothing at all on the request,
 * so an address missing a street or a phone number was accepted here, stored,
 * and only rejected by order-service at saga step 4 — which is AFTER inventory
 * was reserved and AFTER the customer had been charged. The saga compensated
 * correctly (refund, release), but the customer's money still moved, and what
 * came back was an opaque 502 rather than "Delivery address is required".
 *
 * Field names match `CheckoutShippingAddress` in mobile and
 * `CreateOrderPayload['shipping']` in customer-web. `street` is accepted as
 * an alias for `address` because the saga's `shippingFor` already reads
 * either.
 */
export const CheckoutAddressSchema = z
  .object(
    {
      address:  z.string().trim().min(1).optional(),
      street:   z.string().trim().min(1).optional(),
      city:     z.string({ required_error: 'City is required' }).trim().min(1, 'City is required'),
      district: z.string().trim().optional(),
      phone:    z
        .string({ required_error: 'A phone number is required so the courier can call' })
        .trim()
        .min(1, 'A phone number is required so the courier can call'),
      notes:    z.string().trim().max(1000).optional(),
    },
    {
      // Without these, an absent or non-object address reports Zod's bare
      // "Required", which tells the customer nothing.
      required_error:     'A delivery address is required',
      invalid_type_error: 'A delivery address is required',
    },
  )
  .passthrough()
  .refine((a) => Boolean(a.address ?? a.street), {
    message: 'Delivery address is required',
    path:    ['address'],
  });

/** Body of POST /api/v1/checkout/initiate. Carries no monetary field: totals
 *  come from pricing.service, which re-prices the cart against the catalogue. */
export const InitiateCheckoutSchema = z.object({
  shippingAddress: CheckoutAddressSchema,
  billingAddress:  CheckoutAddressSchema.optional(),
  paymentMethod: z
    .object({
      type:  z.string().trim().min(1),
      token: z.string().optional(),
      phone: z.string().optional(),
    })
    .optional(),
});

export type InitiateCheckoutInput = z.infer<typeof InitiateCheckoutSchema>;

export const CheckoutStatusSchema = z.enum(['INITIATED', 'VALIDATING', 'PAYMENT_PENDING', 'PAYMENT_CONFIRMED', 'ORDER_CREATED', 'FAILED', 'COMPLETED']);

export const CheckoutSessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  status: CheckoutStatusSchema.default('INITIATED'),
  cartSnapshot: z.any(),
  shippingAddress: z.any(),
  billingAddress: z.any(),
  // `phone` is the number the mobile money prompt is sent to. It is separate
  // from the shipping phone on purpose — customers routinely pay from a
  // different number than the one the courier calls.
  paymentMethod: z.object({
    type:  z.string(),
    token: z.string().optional(),
    phone: z.string().optional(),
  }),
  orderId: z.string().optional(),
  paymentIntentId: z.string().optional(),
  /**
   * The provider-facing payment reference, kept so a re-driven saga can ask
   * payment-service what actually happened to the collection instead of
   * starting a second one.
   */
  paymentReference: z.string().optional(),
  /**
   * Inventory holds this session already owns.
   *
   * Persisted because the saga is re-drivable: `confirmPayment` re-runs it from
   * step 1, and inventory-service does not deduplicate by sessionId (it stores
   * the id as a label and creates a fresh row every call). Without this, every
   * re-drive took a SECOND hold on the same stock and the first leaked until
   * its TTL lapsed.
   */
  reservations: z.array(z.object({
    variantId:     z.string(),
    reservationId: z.string(),
  })).default([]),
  couponCode: z.string().optional(),
  couponDiscount: z.number().default(0),
  /**
   * Whose goods the discount came off, sellerId to amount, summing exactly to
   * `couponDiscount`. Persisted on the session so a re-driven saga rebuilds
   * the same escrow holds and sends order-service the same allocation.
   */
  vendorDiscounts: z.record(z.number()).default({}),
  shippingCost: z.number().default(0),
  /**
   * sellerId → delivery fee as shipping-service quoted it, summing to
   * `shippingCost`. Persisted so a re-driven saga records the same allocation
   * it charged, rather than re-deriving one.
   */
  vendorShipping: z.record(z.number()).default({}),
  taxAmount: z.number().default(0),
  subtotal: z.number(),
  total: z.number(),
  failureReason: z.string().optional(),
  steps: z.array(z.object({
    step: z.string(),
    status: z.enum(['pending', 'completed', 'failed']),
    completedAt: z.string().optional(),
    error: z.string().optional()
  })),
  createdAt: z.string(),
  expiresAt: z.string(),
  updatedAt: z.string(),
});

export type CheckoutSession = z.infer<typeof CheckoutSessionSchema>;
