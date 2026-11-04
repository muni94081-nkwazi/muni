import { z } from 'zod';

export const loginSchema = z.object({ email: z.string().email(), password: z.string().min(6) });

export const registerSchema = loginSchema.extend({
  firstName:   z.string().min(1).max(100),
  lastName:    z.string().min(1).max(100),
  phoneNumber: z.string().optional(),
});

export const cartItemSchema = z.object({
  product_id: z.string().min(1),
  quantity:   z.number().int().positive(),
});

// ─── Seller Registration ───────────────────────────────────────────────────────

const addressSchema = z.object({
  street:     z.string().min(1),
  city:       z.string().min(1),
  region:     z.string().optional(),
  country:    z.string().length(2, 'ISO 3166-1 alpha-2 country code required'),  // e.g. "UG"
  postalCode: z.string().optional(),
});

const bankAccountSchema = z.object({
  accountNumber: z.string().min(6),
  bankName:      z.string().min(2),
  accountName:   z.string().min(2),
  swiftCode:     z.string().optional(),
});

export const sellerRegisterSchema = z.object({
  businessName:       z.string().min(2).max(200),
  businessType:       z.enum(['individual', 'company', 'partnership']).default('individual'),
  taxId:              z.string().optional(),
  registrationNumber: z.string().optional(),
  businessEmail:      z.string().email().optional(),
  businessPhone:      z.string().optional(),
  businessAddress:    addressSchema,
  bankAccount:        bankAccountSchema,
  storeName:          z.string().min(2).max(100).optional(),
  storeDescription:   z.string().max(500).optional(),
});

export type SellerRegisterInput = z.infer<typeof sellerRegisterSchema>;

// ─── Admin Seller Action ───────────────────────────────────────────────────────

export const sellerVerifySchema = z.object({
  action: z.enum(['approve', 'reject', 'suspend', 'reinstate']),
  reason: z.string().min(5).max(500).optional(),
});

export type SellerVerifyInput = z.infer<typeof sellerVerifySchema>;
