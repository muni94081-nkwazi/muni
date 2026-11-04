import { Prisma } from '../generated/prisma/index.js';
import { prisma } from '../db/prisma.js';
import type { Store } from '../models/marketplace.model.js';
import type { IStoreRepository } from '../types/repositories.js';

// ─── Prisma-backed store repository ───────────────────────────────────────────

type Row = Prisma.StoreGetPayload<Record<string, never>>;

function toDomain(row: Row): Store {
  return {
    id: row.id,
    userId: row.userId,
    storeName: row.storeName,
    storeSlug: row.storeSlug,
    description: row.description,
    logo: row.logo ?? undefined,
    banner: row.banner ?? undefined,
    categories: row.categories,
    location: row.location as Store['location'],
    rating: row.rating,
    reviewCount: row.reviewCount,
    totalSales: row.totalSales,
    commissionRate: row.commissionRate,
    status: row.status,
    verificationStatus: row.verificationStatus,
    joinedAt: row.joinedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class PrismaStoreRepository implements IStoreRepository {
  async findAll(): Promise<Store[]> {
    const rows = await prisma.store.findMany({ orderBy: { joinedAt: 'asc' } });
    return rows.map(toDomain);
  }

  /**
   * Resolve a store by its slug, its own id, or the id of the seller who owns
   * it.
   *
   * The third is what lets a product page find its store: a Product carries
   * `sellerId`, which is the seller's USER id — the same value as Store.userId,
   * and not the store's own id. Without it the only way from a product to its
   * store was a slug the product does not carry.
   *
   * Ordered so an exact slug or id still wins; userId is the fallback.
   */
  async findBySlugOrId(slugOrId: string): Promise<Store | undefined> {
    const row = await prisma.store.findFirst({
      where: { OR: [{ storeSlug: slugOrId }, { id: slugOrId }] },
    });
    if (row) return toDomain(row);

    return this.findByUser(slugOrId);
  }

  async findByUser(userId: string): Promise<Store | undefined> {
    const row = await prisma.store.findFirst({ where: { userId }, orderBy: { joinedAt: 'asc' } });
    return row ? toDomain(row) : undefined;
  }

  async create(store: Store): Promise<Store> {
    const row = await prisma.store.create({
      data: {
        id: store.id,
        userId: store.userId,
        storeName: store.storeName,
        storeSlug: store.storeSlug,
        description: store.description,
        logo: store.logo ?? null,
        banner: store.banner ?? null,
        categories: store.categories,
        location: store.location as unknown as Prisma.InputJsonValue,
        rating: store.rating,
        reviewCount: store.reviewCount,
        totalSales: store.totalSales,
        commissionRate: store.commissionRate,
        status: store.status,
        verificationStatus: store.verificationStatus,
        joinedAt: new Date(store.joinedAt),
        updatedAt: new Date(store.updatedAt),
      },
    });
    return toDomain(row);
  }

  async updateByUser(
    userId: string,
    patch: Partial<Store>,
    updatedAt: string,
  ): Promise<Store | undefined> {
    const existing = await prisma.store.findFirst({ where: { userId }, select: { id: true } });
    if (!existing) return undefined;

    const data: Prisma.StoreUpdateInput = { updatedAt: new Date(updatedAt) };
    if (patch.storeName !== undefined) data.storeName = patch.storeName;
    if (patch.storeSlug !== undefined) data.storeSlug = patch.storeSlug;
    if (patch.description !== undefined) data.description = patch.description;
    if (patch.logo !== undefined) data.logo = patch.logo;
    if (patch.banner !== undefined) data.banner = patch.banner;
    if (patch.categories !== undefined) data.categories = patch.categories;
    if (patch.location !== undefined) data.location = patch.location as unknown as Prisma.InputJsonValue;
    if (patch.rating !== undefined) data.rating = patch.rating;
    if (patch.reviewCount !== undefined) data.reviewCount = patch.reviewCount;
    if (patch.totalSales !== undefined) data.totalSales = patch.totalSales;
    if (patch.commissionRate !== undefined) data.commissionRate = patch.commissionRate;
    if (patch.status !== undefined) data.status = patch.status;
    if (patch.verificationStatus !== undefined) data.verificationStatus = patch.verificationStatus;

    const row = await prisma.store.update({ where: { id: existing.id }, data });
    return toDomain(row);
  }
}

export const prismaStoreRepository = new PrismaStoreRepository();
