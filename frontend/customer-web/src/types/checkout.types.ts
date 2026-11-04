import type { CreateOrderPayload, PaymentMethod } from './order.types';

/**
 * Shapes returned by checkout-service.
 *
 * Note what the request type does NOT carry: no items, no prices, no totals.
 * checkout-service reads the cart by the authenticated identity and re-prices
 * every line against the catalogue, so the browser has nothing to say about
 * what anything costs. Sending a subtotal here would simply be ignored.
 */
export interface InitiateCheckoutPayload {
  shippingAddress: CreateOrderPayload['shipping'];
  billingAddress?: CreateOrderPayload['shipping'];
  paymentMethod: {
    type: PaymentMethod;
    /** Client-side-tokenized card, produced by the card gateway's SDK — never a raw PAN/CVC. */
    token?: string;
    /** Number the mobile money PIN prompt is sent to. */
    phone?: string;
  };
}

export type CheckoutStatus =
  | 'INITIATED'
  | 'VALIDATING'
  | 'PAYMENT_PENDING'
  | 'PAYMENT_CONFIRMED'
  | 'ORDER_CREATED'
  | 'FAILED'
  | 'COMPLETED';

export interface CheckoutStepRecord {
  step: string;
  status: 'pending' | 'completed' | 'failed';
  completedAt?: string;
  error?: string;
}

export interface CheckoutSession {
  id: string;
  userId: string;
  status: CheckoutStatus;
  orderId?: string;
  paymentIntentId?: string;
  /** All server-computed. Displayed, never submitted. */
  subtotal: number;
  shippingCost: number;
  taxAmount: number;
  couponDiscount: number;
  total: number;
  failureReason?: string;
  steps: CheckoutStepRecord[];
  createdAt: string;
  expiresAt: string;
  updatedAt: string;
}
