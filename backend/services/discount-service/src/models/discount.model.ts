import { z } from 'zod';

export enum DiscountType {
  PERCENTAGE = 'PERCENTAGE',
  FIXED_AMOUNT = 'FIXED_AMOUNT',
  FREE_SHIPPING = 'FREE_SHIPPING',
  BOGO = 'BOGO',
  FLASH_SALE = 'FLASH_SALE'
}

export interface Discount {
  id: string;
  code: string;
  type: DiscountType;
  value: number;
  minOrderAmount: number;
  maxUsageCount: number;
  usageCount: number;
  perUserLimit: number;
  applicableCategories: string[];
  applicableProducts: string[];
  applicableSellers: string[];
  startsAt: Date;
  expiresAt: Date;
  active: boolean;
  createdBy: string;
  createdAt: Date;
  /**
   * Stamped the first time this discount is observed expired.
   *
   * `discount.expired` used to be published on every validation of an expired
   * code, so a popular dead coupon produced an unbounded stream of identical
   * events. Optional because it is absent until that first observation.
   */
  expiredNotifiedAt?: Date | null;
}

export const createDiscountSchema = z.object({
  code: z.string().trim().toUpperCase().min(3).max(64),
  type: z.nativeEnum(DiscountType),
  // Bounded above as well as below. A PERCENTAGE discount is additionally
  // capped at 100 by the refinement below — `value: 500` on a percentage code
  // would otherwise compute a negative order total.
  value: z.number().min(0).max(1_000_000_000),
  minOrderAmount: z.number().min(0).default(0),
  maxUsageCount: z.number().int().min(1).default(1000000),
  perUserLimit: z.number().int().min(1).default(1),
  applicableCategories: z.array(z.string()).default([]),
  applicableProducts: z.array(z.string()).default([]),
  applicableSellers: z.array(z.string()).default([]),
  startsAt: z.coerce.date().default(() => new Date()),
  expiresAt: z.coerce.date(),
  active: z.boolean().default(true)
})
  .refine(
    (data) => data.type !== DiscountType.PERCENTAGE || data.value <= 100,
    { path: ['value'], message: 'A percentage discount cannot exceed 100' },
  )
  .refine(
    // A code that is already expired can never be redeemed, so accepting one
    // just creates a row that looks live in the admin list and fails at the
    // till.
    (data) => data.expiresAt.getTime() > Date.now(),
    { path: ['expiresAt'], message: 'Expiry must be in the future' },
  )
  .refine(
    (data) => data.expiresAt.getTime() > data.startsAt.getTime(),
    { path: ['expiresAt'], message: 'Expiry must be after the start date' },
  );

// `.partial()` is not available on a ZodEffects (the object carries refinements
// above), so the update schema restates the shape as optional and re-applies
// the percentage rule — the only one that can be checked on a partial payload.
// The date rules need both dates present, so they belong to creation.
export const updateDiscountSchema = z.object({
  code: z.string().trim().toUpperCase().min(3).max(64).optional(),
  type: z.nativeEnum(DiscountType).optional(),
  value: z.number().min(0).max(1_000_000_000).optional(),
  minOrderAmount: z.number().min(0).optional(),
  maxUsageCount: z.number().int().min(1).optional(),
  perUserLimit: z.number().int().min(1).optional(),
  applicableCategories: z.array(z.string()).optional(),
  applicableProducts: z.array(z.string()).optional(),
  applicableSellers: z.array(z.string()).optional(),
  startsAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional(),
  active: z.boolean().optional(),
})
  .refine(
    (data) => data.type !== DiscountType.PERCENTAGE || data.value === undefined || data.value <= 100,
    { path: ['value'], message: 'A percentage discount cannot exceed 100' },
  )
  .refine(
    (data) => data.expiresAt === undefined || data.expiresAt.getTime() > Date.now(),
    { path: ['expiresAt'], message: 'Expiry must be in the future' },
  );

/** Undo of a redemption, from a saga compensation. */
export const reverseDiscountSchema = z.object({
  code:    z.string().trim().toUpperCase().min(1),
  userId:  z.string().trim().min(1),
  orderId: z.string().trim().min(1),
});

/** Redemption of a code against an order. */
export const applyDiscountSchema = z.object({
  code: z.string().trim().toUpperCase().min(1),
  userId: z.string().trim().min(1),
  orderAmount: z.number().min(0),
  orderId: z.string().trim().min(1).optional(),
  items: z.array(z.object({
    productId: z.string(),
    categoryId: z.string().optional(),
    sellerId: z.string().optional(),
    price: z.number().min(0),
    quantity: z.number().int().min(1)
  })).default([])
});

export const validateDiscountSchema = z.object({
  code: z.string().toUpperCase(),
  userId: z.string(),
  orderAmount: z.number().min(0),
  items: z.array(z.object({
    productId: z.string(),
    categoryId: z.string().optional(),
    sellerId: z.string().optional(),
    price: z.number().min(0),
    quantity: z.number().min(1)
  })).default([])
});
