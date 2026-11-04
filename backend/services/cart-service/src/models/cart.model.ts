import { z } from 'zod';

export const CartItemSchema = z.object({
  id: z.string().uuid(),
  productId: z.string(),
  sellerId: z.string(),
  productName: z.string(),
  productImage: z.string(),
  variantId: z.string().optional(),
  variantLabel: z.string().optional(),
  price: z.number().nonnegative(),
  quantity: z.number().int().positive(),
  maxQuantity: z.number().int().positive(),
  weight: z.number().nonnegative().optional(),
  addedAt: z.string().datetime(),
});

export const CartSchema = z.object({
  userId: z.string(),
  items: z.array(CartItemSchema),
  couponCode: z.string().optional(),
  couponDiscount: z.number().nonnegative(),
  // Why the discount is what it is, when it is not what the customer expected:
  // set when a code was rejected or could not be checked. Additive and
  // optional — nothing that read this shape before is affected.
  couponMessage: z.string().optional(),
  subtotal: z.number().nonnegative(),
  itemCount: z.number().int().nonnegative(),
  updatedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

export type CartItem = z.infer<typeof CartItemSchema>;
export type Cart = z.infer<typeof CartSchema>;

// ─── Abandoned Cart Models (Phase 15 Feature 4) ──────────────────────────────

export interface AbandonedCart {
  id: string;
  userId: string;
  userEmail: string;
  items: CartItem[];
  subtotal: number;
  total: number;
  currency: string;
  status: 'abandoned' | 'recovered' | 'expired';
  lastActivityAt: string;
  createdAt: string;
}

export interface RecoveryAttempt {
  id: string;
  cartId: string;
  userId: string;
  channel: 'email' | 'sms' | 'push';
  attemptedAt: string;
  success: boolean;
}

export const AddItemSchema = z.object({
  productId: z.string(),
  sellerId: z.string(),
  productName: z.string(),
  productImage: z.string(),
  price: z.number().nonnegative(),
  quantity: z.number().int().positive(),
  maxQuantity: z.number().int().positive(),
  variantId: z.string().optional(),
  variantLabel: z.string().optional(),
  weight: z.number().nonnegative().optional(),
});

export const UpdateItemQuantitySchema = z.object({
  quantity: z.number().int().nonnegative(), // 0 removes item
});

export const ApplyCouponSchema = z.object({
  code: z.string().min(1),
});

export const MergeCartSchema = z.object({
  sessionId: z.string().min(1),
});
