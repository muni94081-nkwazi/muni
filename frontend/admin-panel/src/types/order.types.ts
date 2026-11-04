// Mirrors order-service's domain model
// (backend/services/order-service/src/models/order.model.ts).
//
// An order that spans several sellers is stored as one master Order plus one
// SubOrder per seller. The admin console is the only surface that sees both:
// a customer sees the master order, a seller sees only their own sub-order.

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

/** Retained under its old name so existing imports keep resolving. */
export type OrderStatus = MasterOrderStatus;

export interface OrderItem {
  id: string;
  productId: string;
  variantId?: string;
  sellerId: string;
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
  vendorShare: number;
  platformCommission: number;
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
  /**
   * The buyer's id. order-service does not join against auth-service, so there
   * is no customer name or email on this payload — the old hand-written type
   * had `customerName`, which no endpoint ever returned.
   */
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
  /** One entry per seller in the order — this is the split. */
  subOrders: SubOrder[];
  itemCount: number;
  placedAt: string | null;
  paidAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PageMeta {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}
