import { z } from 'zod';

export const StoreStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']);
export const VerificationStatusSchema = z.enum(['pending', 'verified', 'rejected']);

export const StoreSchema = z.object({
  id: z.string(),
  userId: z.string(),
  storeName: z.string().min(2),
  storeSlug: z.string(),
  description: z.string(),
  logo: z.string().optional(),
  banner: z.string().optional(),
  categories: z.array(z.string()),
  location: z.object({ city: z.string(), country: z.string() }),
  rating: z.number().default(0),
  reviewCount: z.number().default(0),
  totalSales: z.number().default(0),
  commissionRate: z.number().default(5),
  status: StoreStatusSchema.default('ACTIVE'),
  verificationStatus: VerificationStatusSchema.default('pending'),
  joinedAt: z.string(),
  updatedAt: z.string(),
});

export type Store = z.infer<typeof StoreSchema>;

/**
 * What a seller may supply when opening a storefront.
 *
 * createStore took `data: any` and spread it straight into the row, so nothing
 * checked the body at all. A POST without `location` reached Prisma, which
 * rejects it because the column is non-nullable Json — and since the controller
 * had no try/catch and Express 4 does not forward async throws, that rejection
 * went unhandled and **killed the process**. One malformed request took the
 * whole service down for every seller.
 *
 * Deliberately narrower than StoreSchema: id, userId, storeSlug, rating,
 * reviewCount, totalSales, commissionRate, status and verificationStatus are
 * all server-owned. Accepting them here would let a seller open a store that
 * was pre-verified, zero-commission, or attributed to somebody else.
 */
export const CreateStoreSchema = z.object({
  storeName:   z.string().min(2).max(120),
  description: z.string().max(2000).default(''),
  categories:  z.array(z.string()).default([]),
  // Required because the database column is. seller-center already types it
  // as mandatory, so this matches the real client rather than tightening it.
  location:    z.object({ city: z.string().min(1), country: z.string().min(1) }),
  logo:        z.string().url().optional(),
  banner:      z.string().url().optional(),
});

export type CreateStoreInput = z.infer<typeof CreateStoreSchema>;
