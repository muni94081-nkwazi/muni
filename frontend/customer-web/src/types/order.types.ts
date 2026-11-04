export type OrderStatus =
  | 'pending'
  | 'payment_processing'
  | 'paid'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'payment_failed'
  | 'refunded'
  | 'return_requested'
  | 'returned';

export type PaymentMethod = 'mtn_momo' | 'airtel_money' | 'card' | 'visa_card' | 'cod';

export type CardBrand = 'VISA' | 'MASTERCARD';

/**
 * 3DS2 authentication state, mirrored from payment-service's
 * `ThreeDSecureStatus`. `CHALLENGE_REQUIRED` means the checkout must render
 * `threeDSecureRedirectUrl` in an iframe/modal before the order can settle.
 */
export type ThreeDSecureStatus = 'CHALLENGE_REQUIRED' | 'AUTHENTICATED' | 'REJECTED';

export interface OrderItem {
  id: string;
  productId: string;
  vendorId: string;
  productName: string;
  productSku: string;
  productImageUrl: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface ShippingDetails {
  address: string;
  city: string;
  district: string | null;
  phone: string;
  notes: string | null;
}

export interface Order {
  id: string;
  orderNumber: string;
  userId: string;
  status: OrderStatus;
  statusLabel: string;
  subtotal: number;
  shippingFee: number;
  taxAmount: number;
  discountAmount: number;
  couponCode: string | null;
  totalAmount: number;
  currency: string;
  paymentMethod: PaymentMethod | null;
  paymentReference: string | null;
  shipping: ShippingDetails;
  items: OrderItem[];
  itemCount: number;
  placedAt: string | null;
  paidAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
  /** Present while a visa_card payment is awaiting a 3DS2 challenge — render in an iframe/modal. */
  threeDSecureRedirectUrl?: string | null;
  threeDSecureStatus?: ThreeDSecureStatus | null;
}

export interface CreateOrderPayload {
  items: Array<{ product_id: string; quantity: number }>;
  shipping: {
    address: string;
    city: string;
    district?: string;
    phone: string;
    notes?: string;
    shipping_fee?: number;
  };
  payment_method?: PaymentMethod;
  coupon_code?: string;
  discount_amount?: number;
  coupon_redemption_id?: string | null;
}

export interface InitiatePaymentPayload {
  payment_method: 'mtn_momo' | 'airtel_money' | 'card' | 'visa_card';
  phone_number?: string;
  /** Client-side-tokenized card, produced by the card gateway's SDK — never a raw PAN/CVC. */
  card_token?: string;
}
