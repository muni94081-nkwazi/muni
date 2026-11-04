// Mirrors order-service's domain model (backend/services/order-service/src/models/order.model.ts).
//
// A seller never sees a master Order. An order that spans several sellers is
// split into one SubOrder each, and /api/v1/seller/orders returns only the
// sub-orders belonging to the caller — so "order" in this app means SubOrder.

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
export type OrderStatus = SubOrderStatus;

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
  weightKg?: number;
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
  /** The seller's share after the platform commission below is deducted. */
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

/**
 * `Order` is an alias for SubOrder, not a separate shape.
 *
 * The old hand-written Order type had `customerName` / `customerEmail` fields
 * that no endpoint returns — order-service does not join against auth-service,
 * so buyer identity is not in this payload.
 */
export type Order = SubOrder;

export interface PageMeta {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}
