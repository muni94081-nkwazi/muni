export type PaymentMethod = 'MTN_MOMO' | 'AIRTEL_MONEY' | 'CARD' | 'CASH_ON_DELIVERY';
export type PaymentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'refunded' | 'cancelled';
export interface Payment { id: string; orderId: string; reference: string; method: PaymentMethod; status: PaymentStatus; amount: number; currency: string; createdAt: string; paidAt: string | null; }
