import { z } from 'zod';

// ─── Request schemas ──────────────────────────────────────────────────────────
//
// Every route here moves money. `initiatePayment` in particular destructured
// eleven fields off `req.body` and checked three of them by truthiness, so
// `amount: "50000"` (a string) or `amount: -1` reached the provider drivers
// unexamined.
//
// Webhooks are the exception and stay loose on purpose — see the note above
// `WebhookProviderParams`.

/** Money: positive, finite, and bounded so a typo cannot become a fortune. */
const MoneyAmount = z
  .number({ invalid_type_error: 'amount must be a number' })
  .positive('amount must be greater than 0')
  .max(1_000_000_000, 'amount exceeds the per-transaction ceiling');

const PaymentMethodSchema = z.enum([
  'mtn_momo', 'airtel_money', 'card', 'visa_card',
  'flutterwave', 'pesapal', 'cod',
]);

/** One vendor's slice of a multi-vendor basket. */
export const VendorBreakdownEntrySchema = z.object({
  sellerId:   z.string().trim().min(1, 'Each breakdown line must name a seller'),
  subOrderId: z.string().trim().min(1).optional(),
  amountUGX:  z.number().nonnegative('Breakdown amounts cannot be negative'),
});

export const InitiatePaymentSchema = z.object({
  orderId:  z.string().trim().min(1, 'orderId is required'),
  amount:   MoneyAmount,
  method:   PaymentMethodSchema,
  currency: z.string().trim().length(3).toUpperCase().default('UGX'),
  buyerId:  z.string().trim().min(1, 'buyerId is required'),

  // Either a single seller or an explicit per-vendor split; the refinement
  // below enforces that at least one is present. Escrow needs to know who the
  // money is being held for, and there is no safe default.
  sellerId:        z.string().trim().min(1).optional(),
  vendorBreakdown: z.array(VendorBreakdownEntrySchema).optional(),

  phoneNumber:    z.string().trim().max(32).optional(),
  email:          z.string().email().optional(),
  customerName:   z.string().trim().max(200).optional(),
  idempotencyKey: z.string().trim().max(255).optional(),
  // Client-side-tokenized card from the gateway SDK — never a raw PAN/CVC.
  cardToken:      z.string().trim().max(512).optional(),
}).refine(
  (data) => Boolean(data.sellerId) || (data.vendorBreakdown?.length ?? 0) > 0,
  {
    path: ['sellerId'],
    message: 'Provide either sellerId or a non-empty vendorBreakdown',
  },
);

export const RefundPaymentSchema = z.object({
  // Omitted means "refund the full amount", which the handler resolves from
  // the stored payment — so this is optional but must be sane when present.
  amount: MoneyAmount.optional(),
  reason: z.string().trim().max(500).optional(),
});

/** Attaches order-service's real sub-order ids and payout figures. */
export const LinkSubOrdersSchema = z.object({
  orderId: z.string().trim().min(1, 'orderId is required'),
  subOrders: z.array(z.object({
    sellerId:           z.string().trim().min(1),
    subOrderId:         z.string().trim().min(1),
    vendorShare:        z.number().nonnegative().optional(),
    platformCommission: z.number().nonnegative().optional(),
  })).min(1, 'At least one sub-order is required'),
});

export const PaymentReferenceParams = z.object({
  reference: z.string().trim().min(1, 'reference is required'),
});

// ─── Escrow ───────────────────────────────────────────────────────────────────

export const OrderIdParams = z.object({
  orderId: z.string().trim().min(1, 'orderId is required'),
});

export const CreateEscrowSchema = z.object({
  orderId: z.string().trim().min(1, 'orderId is required'),
  buyerId: z.string().trim().min(1, 'buyerId is required'),
  holds: z.array(z.object({
    vendorId:   z.string().trim().min(1, 'Each hold must name a vendor'),
    subOrderId: z.string().trim().min(1).optional(),
    amountUGX:  z.number().nonnegative(),
  })).min(1, 'An escrow breakdown needs at least one vendor'),
});

export const ReleaseEscrowSchema = z.object({
  orderId: z.string().trim().min(1, 'orderId is required'),
  // Narrows the release to one seller in a multi-vendor basket — the buyer
  // confirming receipt of Seller A's parcel must not pay Seller B, who may not
  // have shipped. Optional so a single-vendor order can keep calling with just
  // an orderId; see releaseEscrow in escrow.service.ts.
  vendorId:   z.string().trim().min(1).optional(),
  subOrderId: z.string().trim().min(1).optional(),
});

export const RefundEscrowSchema = z.object({
  orderId: z.string().trim().min(1, 'orderId is required'),
  // Same narrowing as release: a dispute is with one seller, and returning the
  // whole basket to the buyer over it would take money from sellers the dispute
  // was never about.
  vendorId:   z.string().trim().min(1).optional(),
  subOrderId: z.string().trim().min(1).optional(),
  // Recorded on the hold and carried on the event, so a refund can be traced
  // back to the decision that caused it.
  disputeId:  z.string().trim().min(1).optional(),
});

export const HoldEscrowSchema = z.object({
  orderId:   z.string().trim().min(1, 'orderId is required'),
  disputeId: z.string().trim().min(1, 'disputeId is required'),
  // Narrows the freeze to one seller in a multi-vendor basket.
  vendorId:  z.string().trim().min(1).optional(),
});

// ─── Payouts and withdrawals ──────────────────────────────────────────────────

export const RequestPayoutSchema = z.object({
  amount: MoneyAmount,
  method: z.enum(['mtn_momo', 'airtel_money', 'bank_transfer']),
  destinationAccount: z.string().trim().min(1, 'destinationAccount is required').max(128),
  vendorId: z.string().trim().min(1).optional(),
});

export const ReviewWithdrawalSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

// ─── Webhooks ─────────────────────────────────────────────────────────────────
//
// Webhook BODIES are deliberately NOT schema-validated. They are written by
// the provider, not by a client, and each handler verifies an HMAC/RSA
// signature over the raw bytes before reading anything. Rejecting an
// unexpected field with a 400 would drop a legitimate callback whenever a
// provider adds one — and providers do, without notice. A dropped payment
// confirmation is far worse than an unknown key.
//
// The provider name in the path is a different matter: it selects which secret
// verifies the signature, so it must be one this service actually knows.
export const WebhookProviderParams = z.object({
  provider: z.enum(['flutterwave', 'pesapal', 'mtn', 'momo', 'airtel', 'visa']),
});
