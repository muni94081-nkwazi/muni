export interface CartItem {
  id: string;
  productId: string;
  variantId?: string;
  sellerId: string; // also aliased as vendorId for compatibility
  vendorId?: string;
  productName: string;
  productSku: string;
  productImageUrl: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  isAvailable?: boolean;
  stockSnapshot?: number | null;
  exceedsAvailableStock?: boolean;
  weightKg?: number;
}

export type MasterOrderStatus =
  | 'pending'
  | 'payment_processing'
  | 'paid'
  | 'payment_confirmed'
  | 'processing'
  | 'completed'
  | 'cancelled'
  | 'payment_failed'
  | 'refunded';

export type SubOrderStatus =
  | 'pending'
  | 'payment_confirmed'
  | 'processing'
  | 'picked_up'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

export type OrderStatus = MasterOrderStatus; // Backwards compatibility

export interface OrderItem {
  id: string;
  productId: string;
  variantId?: string;
  sellerId: string;
  vendorId?: string;
  productName: string;
  productSku: string;
  productImageUrl: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  weightKg?: number;
  /**
   * The inventory hold this line was created against.
   *
   * Persisted so the payment-confirmation consumer can settle exactly the
   * reservation that was taken, rather than blind-decrementing stock. Without
   * it a direct-path order's hold simply expired on its TTL and the stock
   * silently returned to the shelf after the customer had paid for it.
   */
  reservationId?: string;
}

export interface ShippingDetails {
  address: string;
  city: string;
  district: string | null;
  phone: string;
  notes: string | null;
  shippingMethod?: string;
}

export interface SubOrder {
  id: string;
  subOrderNumber: string;
  masterOrderId: string;
  sellerId: string;
  sellerName?: string;
  status: SubOrderStatus;
  statusLabel: string;
  items: OrderItem[];
  subtotal: number;
  shippingFee: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  vendorShare: number;      // 85-90% of subtotal
  platformCommission: number; // 5-10% of subtotal
  placedAt: string;
  shippedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  trackingNumber?: string | null;
  carrier?: string | null;
  estimatedDeliveryDate?: string | null;
  updatedAt: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  userId: string;
  status: MasterOrderStatus;
  statusLabel: string;
  subtotal: number;
  shippingFee: number;
  taxAmount: number;
  discountAmount: number;
  couponCode: string | null;
  totalAmount: number;
  currency: string;
  paymentMethod: string | null;
  paymentReference: string | null;
  shipping: ShippingDetails;
  items: OrderItem[];
  subOrders: SubOrder[];
  itemCount: number;
  placedAt: string | null;
  paidAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;

  /**
   * Which path created this order, and therefore who owns settling its
   * inventory holds.
   *
   *   'saga'   — checkout-service reserved, charged and deducts the stock
   *              itself as its final step. order-service must not deduct
   *              again; doing so takes the goods off the shelf twice.
   *   'direct' — created through POST /orders. order-service took the holds
   *              and settles them when payment is confirmed.
   */
  settlementPath?: 'saga' | 'direct';

  /** Set once the order's inventory holds have been deducted. Also the
   *  idempotency guard: payment.completed can arrive more than once. */
  inventorySettledAt?: string | null;

  /**
   * The checkout session that produced this order, and the idempotency key for
   * order creation. Null for orders not placed through checkout-service.
   * See the unique sparse index in order.schema.ts.
   */
  checkoutSessionId?: string | null;
  createdAt: string;
  updatedAt: string;
}
