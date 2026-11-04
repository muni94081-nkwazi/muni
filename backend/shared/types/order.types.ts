export type OrderStatus = 'pending' | 'payment_processing' | 'paid' | 'confirmed' | 'processing' | 'shipped' | 'out_for_delivery' | 'delivered' | 'cancelled' | 'payment_failed' | 'refunded';
export interface OrderItem { id: string; productId: string; productName: string; unitPrice: number; quantity: number; lineTotal: number; }
export interface Order { id: string; orderNumber: string; userId: string; status: OrderStatus; subtotal: number; shippingFee: number; totalAmount: number; currency: string; items: OrderItem[]; placedAt: string | null; }
