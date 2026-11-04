import { Prisma } from '../generated/prisma/index.js';
import { prisma } from '../db/prisma.js';
import type {
  PriceHistoryPoint,
  PriceTracking,
  Wishlist,
  WishlistActivity,
  WishlistCollaborator,
  WishlistItem,
  WishlistShare,
} from '../models/wishlist.model.js';
import type {
  IPriceAlertRepository,
  IWishlistRepository,
  IWishlistShareRepository,
} from '../types/repositories.js';

// ─── Prisma-backed wishlist repositories ──────────────────────────────────────

type WishlistRow = Prisma.WishlistGetPayload<{ include: { items: true } }>;
type ItemRow = Prisma.WishlistItemGetPayload<Record<string, never>>;
type AlertRow = Prisma.PriceTrackingGetPayload<Record<string, never>>;
type HistoryRow = Prisma.PriceHistoryPointGetPayload<Record<string, never>>;
type ShareRow = Prisma.WishlistShareGetPayload<Record<string, never>>;
type CollaboratorRow = Prisma.WishlistCollaboratorGetPayload<Record<string, never>>;
type ActivityRow = Prisma.WishlistActivityGetPayload<Record<string, never>>;

function isMissingRecord(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025';
}

const itemToDomain = (row: ItemRow): WishlistItem => ({
  id: row.id,
  productId: row.productId,
  productName: row.productName,
  productImage: row.productImage,
  price: row.price.toNumber(),
  addedAt: row.addedAt,
  priceAtAdd: row.priceAtAdd.toNumber(),
  currentPrice: row.currentPrice.toNumber(),
});

const wishlistToDomain = (row: WishlistRow): Wishlist => ({
  id: row.id,
  userId: row.userId,
  name: row.name,
  isPublic: row.isPublic,
  items: [...row.items]
    .sort((a, b) => a.addedAt.getTime() - b.addedAt.getTime())
    .map(itemToDomain),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export class PrismaWishlistRepository implements IWishlistRepository {
  async create(w: Wishlist): Promise<Wishlist> {
    const row = await prisma.wishlist.create({
      data: {
        id: w.id,
        userId: w.userId,
        name: w.name,
        isPublic: w.isPublic,
        createdAt: w.createdAt,
        updatedAt: w.updatedAt,
      },
      include: { items: true },
    });
    return wishlistToDomain(row);
  }

  async findByUser(userId: string): Promise<Wishlist[]> {
    const rows = await prisma.wishlist.findMany({
      where: { userId },
      include: { items: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(wishlistToDomain);
  }

  async findOne(userId: string, id: string): Promise<Wishlist | undefined> {
    // Scoped by userId as well as id: a list belongs to its owner, and the
    // Map's nesting made that structurally impossible to get wrong.
    const row = await prisma.wishlist.findFirst({ where: { id, userId }, include: { items: true } });
    return row ? wishlistToDomain(row) : undefined;
  }

  async findPublic(id: string): Promise<Wishlist | undefined> {
    const row = await prisma.wishlist.findFirst({
      where: { id, isPublic: true },
      include: { items: true },
    });
    return row ? wishlistToDomain(row) : undefined;
  }

  async update(
    userId: string,
    id: string,
    patch: Partial<Pick<Wishlist, 'name' | 'isPublic'>>,
    updatedAt: Date,
  ): Promise<Wishlist | undefined> {
    const owned = await prisma.wishlist.findFirst({ where: { id, userId }, select: { id: true } });
    if (!owned) return undefined;

    const row = await prisma.wishlist.update({
      where: { id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.isPublic !== undefined ? { isPublic: patch.isPublic } : {}),
        updatedAt,
      },
      include: { items: true },
    });
    return wishlistToDomain(row);
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const deleted = await prisma.wishlist.deleteMany({ where: { id, userId } });
    return deleted.count > 0;
  }

  async addItem(
    wishlistId: string,
    item: WishlistItem,
    updatedAt: Date,
  ): Promise<{ wishlist: Wishlist; added: boolean } | undefined> {
    const exists = await prisma.wishlist.findUnique({ where: { id: wishlistId }, select: { id: true } });
    if (!exists) return undefined;

    let added = true;
    try {
      await prisma.wishlistItem.create({
        data: {
          id: item.id,
          wishlistId,
          productId: item.productId,
          productName: item.productName,
          productImage: item.productImage,
          price: item.price,
          priceAtAdd: item.priceAtAdd,
          currentPrice: item.currentPrice,
          addedAt: item.addedAt,
        },
      });
    } catch (err) {
      // P2002 on (wishlistId, productId): already on the list. The original
      // returned the list untouched rather than erroring.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        added = false;
      } else {
        throw err;
      }
    }

    if (added) {
      await prisma.wishlist.update({ where: { id: wishlistId }, data: { updatedAt } });
    }

    const row = await prisma.wishlist.findUnique({ where: { id: wishlistId }, include: { items: true } });
    return row ? { wishlist: wishlistToDomain(row), added } : undefined;
  }

  async removeItem(
    wishlistId: string,
    itemId: string,
    updatedAt: Date,
  ): Promise<{ wishlist: Wishlist; removed: WishlistItem | null } | undefined> {
    const exists = await prisma.wishlist.findUnique({ where: { id: wishlistId }, select: { id: true } });
    if (!exists) return undefined;

    const target = await prisma.wishlistItem.findFirst({ where: { id: itemId, wishlistId } });

    if (target) {
      await prisma.wishlistItem.delete({ where: { id: itemId } });
      await prisma.wishlist.update({ where: { id: wishlistId }, data: { updatedAt } });
    }

    const row = await prisma.wishlist.findUnique({ where: { id: wishlistId }, include: { items: true } });
    if (!row) return undefined;

    return { wishlist: wishlistToDomain(row), removed: target ? itemToDomain(target) : null };
  }

  async moveItem(
    userId: string,
    sourceId: string,
    targetId: string,
    itemId: string,
    updatedAt: Date,
  ): Promise<void> {
    // One transaction: the original spliced the item out of the source array
    // and pushed it onto the target, so an interruption between the two would
    // have lost it entirely.
    await prisma.$transaction(async (tx) => {
      const source = await tx.wishlist.findFirst({ where: { id: sourceId, userId }, select: { id: true } });
      const target = await tx.wishlist.findFirst({ where: { id: targetId, userId }, select: { id: true } });
      if (!source || !target) throw new Error('Wishlist not found');

      const item = await tx.wishlistItem.findFirst({ where: { id: itemId, wishlistId: sourceId } });
      if (!item) throw new Error('Item not found in source wishlist');

      await tx.wishlistItem.delete({ where: { id: itemId } });
      await tx.wishlist.update({ where: { id: sourceId }, data: { updatedAt } });

      const clash = await tx.wishlistItem.findFirst({
        where: { wishlistId: targetId, productId: item.productId },
        select: { id: true },
      });

      // Already on the target list — the original dropped it silently.
      if (clash) return;

      await tx.wishlistItem.create({
        data: {
          id: item.id,
          wishlistId: targetId,
          productId: item.productId,
          productName: item.productName,
          productImage: item.productImage,
          price: item.price,
          priceAtAdd: item.priceAtAdd,
          currentPrice: item.currentPrice,
          addedAt: item.addedAt,
        },
      });
      await tx.wishlist.update({ where: { id: targetId }, data: { updatedAt } });
    });
  }

  async findItemsByProduct(
    productId: string,
  ): Promise<Array<{ userId: string; wishlistId: string; item: WishlistItem }>> {
    // Indexed lookup rather than the nested loop over every user's every list
    // the Map version ran on each price update.
    const rows = await prisma.wishlistItem.findMany({
      where: { productId },
      include: { wishlist: { select: { userId: true } } },
    });

    return rows.map((r) => ({
      userId: r.wishlist.userId,
      wishlistId: r.wishlistId,
      item: itemToDomain(r),
    }));
  }

  async setItemCurrentPrice(itemId: string, currentPrice: number): Promise<void> {
    try {
      await prisma.wishlistItem.update({ where: { id: itemId }, data: { currentPrice } });
    } catch (err) {
      if (!isMissingRecord(err)) throw err;
    }
  }
}

// ── Price alerts ─────────────────────────────────────────────────────────────

const alertToDomain = (row: AlertRow): PriceTracking => ({
  id: row.id,
  userId: row.userId,
  productId: row.productId,
  productName: row.productName,
  targetPrice: row.targetPrice.toNumber(),
  currency: row.currency,
  currentPrice: row.currentPrice.toNumber(),
  lastCheckedAt: row.lastCheckedAt,
  isActive: row.isActive,
  createdAt: row.createdAt.toISOString(),
});

const historyToDomain = (row: HistoryRow): PriceHistoryPoint => ({
  id: row.id,
  productId: row.productId,
  price: row.price.toNumber(),
  currency: row.currency,
  timestamp: row.timestamp,
});

export class PrismaPriceAlertRepository implements IPriceAlertRepository {
  async createAlert(a: PriceTracking): Promise<PriceTracking> {
    const row = await prisma.priceTracking.create({
      data: {
        id: a.id,
        userId: a.userId,
        productId: a.productId,
        productName: a.productName,
        targetPrice: a.targetPrice,
        currency: a.currency,
        currentPrice: a.currentPrice,
        lastCheckedAt: a.lastCheckedAt,
        isActive: a.isActive,
        createdAt: new Date(a.createdAt),
      },
    });
    return alertToDomain(row);
  }

  async findActiveAlertsByUser(userId: string): Promise<PriceTracking[]> {
    const rows = await prisma.priceTracking.findMany({
      where: { userId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(alertToDomain);
  }

  async findAllActiveAlerts(): Promise<PriceTracking[]> {
    const rows = await prisma.priceTracking.findMany({ where: { isActive: true } });
    return rows.map(alertToDomain);
  }

  async deleteAlert(id: string): Promise<boolean> {
    const deleted = await prisma.priceTracking.deleteMany({ where: { id } });
    return deleted.count > 0;
  }

  async updateAlert(id: string, targetPrice: number, lastCheckedAt: string): Promise<PriceTracking | null> {
    try {
      const row = await prisma.priceTracking.update({
        where: { id },
        data: { targetPrice, lastCheckedAt },
      });
      return alertToDomain(row);
    } catch (err) {
      if (isMissingRecord(err)) return null;
      throw err;
    }
  }

  async findPriceHistory(productId: string): Promise<PriceHistoryPoint[]> {
    const rows = await prisma.priceHistoryPoint.findMany({
      where: { productId },
      orderBy: { timestamp: 'asc' },
    });
    return rows.map(historyToDomain);
  }
}

// ── Sharing ──────────────────────────────────────────────────────────────────

const shareToDomain = (row: ShareRow): WishlistShare => ({
  id: row.id,
  wishlistId: row.wishlistId,
  shareToken: row.shareToken,
  sharedWithUserId: row.sharedWithUserId ?? undefined,
  permission: row.permission,
  createdAt: row.createdAt.toISOString(),
  expiresAt: row.expiresAt?.toISOString(),
});

const collaboratorToDomain = (row: CollaboratorRow): WishlistCollaborator => ({
  id: row.id,
  wishlistId: row.wishlistId,
  userId: row.userId,
  email: row.email ?? undefined,
  permission: row.permission,
  addedAt: row.addedAt.toISOString(),
});

const activityToDomain = (row: ActivityRow): WishlistActivity => ({
  id: row.id,
  wishlistId: row.wishlistId,
  userId: row.userId,
  action: row.action,
  timestamp: row.timestamp,
});

export class PrismaWishlistShareRepository implements IWishlistShareRepository {
  async createShare(s: WishlistShare): Promise<WishlistShare> {
    const row = await prisma.wishlistShare.create({
      data: {
        shareToken: s.shareToken,
        id: s.id,
        wishlistId: s.wishlistId,
        sharedWithUserId: s.sharedWithUserId ?? null,
        permission: s.permission,
        createdAt: new Date(s.createdAt),
        expiresAt: s.expiresAt ? new Date(s.expiresAt) : null,
      },
    });
    return shareToDomain(row);
  }

  async findShareByToken(shareToken: string): Promise<WishlistShare | null> {
    const row = await prisma.wishlistShare.findUnique({ where: { shareToken } });
    return row ? shareToDomain(row) : null;
  }

  async addCollaborator(c: WishlistCollaborator): Promise<WishlistCollaborator> {
    const row = await prisma.wishlistCollaborator.upsert({
      where: { wishlistId_userId: { wishlistId: c.wishlistId, userId: c.userId } },
      create: {
        id: c.id,
        wishlistId: c.wishlistId,
        userId: c.userId,
        email: c.email ?? null,
        permission: c.permission,
        addedAt: new Date(c.addedAt),
      },
      // Re-inviting someone updates their permission rather than creating a
      // second row. The array version happily pushed duplicates.
      update: { email: c.email ?? null, permission: c.permission },
    });
    return collaboratorToDomain(row);
  }

  async removeCollaborator(wishlistId: string, userId: string): Promise<boolean> {
    const deleted = await prisma.wishlistCollaborator.deleteMany({ where: { wishlistId, userId } });
    return deleted.count > 0;
  }

  async listCollaborators(wishlistId: string): Promise<WishlistCollaborator[]> {
    const rows = await prisma.wishlistCollaborator.findMany({
      where: { wishlistId },
      orderBy: { addedAt: 'asc' },
    });
    return rows.map(collaboratorToDomain);
  }

  async logActivity(a: WishlistActivity): Promise<void> {
    await prisma.wishlistActivity.create({
      data: {
        id: a.id,
        wishlistId: a.wishlistId,
        userId: a.userId,
        action: a.action,
        timestamp: a.timestamp,
      },
    });
  }

  async listActivity(wishlistId: string): Promise<WishlistActivity[]> {
    const rows = await prisma.wishlistActivity.findMany({
      where: { wishlistId },
      orderBy: { timestamp: 'asc' },
    });
    return rows.map(activityToDomain);
  }
}

export const prismaWishlistRepository = new PrismaWishlistRepository();
export const prismaPriceAlertRepository = new PrismaPriceAlertRepository();
export const prismaWishlistShareRepository = new PrismaWishlistShareRepository();
