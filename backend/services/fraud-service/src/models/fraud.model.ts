import { z } from 'zod';

export const ScoreRequestSchema = z.object({
  orderId: z.string(),
  userId: z.string(),
  amount: z.number(),
  currency: z.string(),
  paymentMethod: z.string(),
  billingAddress: z.string(),
  shippingAddress: z.string(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  accountCreatedAt: z.string(),
  recentOrdersCount: z.number().default(0),
  recentFailedPayments: z.number().default(0),
  cardsUsedCount: z.number().default(1),
  amountLast24h: z.number().default(0)
});
