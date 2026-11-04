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

// ─── In-memory wishlist repositories ──────────────────────────────────────────
//
// For tests, and for running without a database. Reads return structuredClones
// so a caller mutating what it received changes nothing, matching Prisma.

export class MemoryWishlistRepository implements IWishlistRepository {
  private readonly store = new Map<string, Wishlist>();

  clear(): void {
    this.store.clear();
  }

  async create(w: Wishlist): Promise<Wishlist> {
    this.store.set(w.id, structuredClone(w));
    return structuredClone(w);
  }

  async findByUser(userId: string): Promise<Wishlist[]> {
    return [...this.store.values()]
      .filter((w) => w.userId === userId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((w) => structuredClone(w));
  }

  async findOne(userId: string, id: string): Promise<Wishlist | undefined> {
    const found = this.store.get(id);
    return found && found.userId === userId ? structuredClone(found) : undefined;
  }

  async findPublic(id: string): Promise<Wishlist | undefined> {
    const found = this.store.get(id);
    return found?.isPublic ? structuredClone(found) : undefined;
  }

  async update(
    userId: string,
    id: string,
    patch: Partial<Pick<Wishlist, 'name' | 'isPublic'>>,
    updatedAt: Date,
  ): Promise<Wishlist | undefined> {
    const current = this.store.get(id);
    if (!current || current.userId !== userId) return undefined;

    if (patch.name !== undefined) current.name = patch.name;
    if (patch.isPublic !== undefined) current.isPublic = patch.isPublic;
    current.updatedAt = updatedAt;

    return structuredClone(current);
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const current = this.store.get(id);
    if (!current || current.userId !== userId) return false;
    this.store.delete(id);
    return true;
  }

  async addItem(
    wishlistId: string,
    item: WishlistItem,
    updatedAt: Date,
  ): Promise<{ wishlist: Wishlist; added: boolean } | undefined> {
    const current = this.store.get(wishlistId);
    if (!current) return undefined;

    // Stands in for the (wishlistId, productId) unique index.
    if (current.items.some((i) => i.productId === item.productId)) {
      return { wishlist: structuredClone(current), added: false };
    }

    current.items.push(structuredClone(item));
    current.updatedAt = updatedAt;

    return { wishlist: structuredClone(current), added: true };
  }

  async removeItem(
    wishlistId: string,
    itemId: string,
    updatedAt: Date,
  ): Promise<{ wishlist: Wishlist; removed: WishlistItem | null } | undefined> {
    const current = this.store.get(wishlistId);
    if (!current) return undefined;

    const index = current.items.findIndex((i) => i.id === itemId);
    if (index === -1) return { wishlist: structuredClone(current), removed: null };

    const [removed] = current.items.splice(index, 1);
    current.updatedAt = updatedAt;

    return { wishlist: structuredClone(current), removed: structuredClone(removed!) };
  }

  async moveItem(
    userId: string,
    sourceId: string,
    targetId: string,
    itemId: string,
    updatedAt: Date,
  ): Promise<void> {
    const source = this.store.get(sourceId);
    const target = this.store.get(targetId);
    if (!source || !target || source.userId !== userId || target.userId !== userId) {
      throw new Error('Wishlist not found');
    }

    const index = source.items.findIndex((i) => i.id === itemId);
    if (index === -1) throw new Error('Item not found in source wishlist');

    const [item] = source.items.splice(index, 1);
    source.updatedAt = updatedAt;

    if (!target.items.some((i) => i.productId === item!.productId)) {
      target.items.push(item!);
      target.updatedAt = updatedAt;
    }
  }

  async findItemsByProduct(
    productId: string,
  ): Promise<Array<{ userId: string; wishlistId: string; item: WishlistItem }>> {
    const out: Array<{ userId: string; wishlistId: string; item: WishlistItem }> = [];
    for (const w of this.store.values()) {
      for (const item of w.items) {
        if (item.productId === productId) {
          out.push({ userId: w.userId, wishlistId: w.id, item: structuredClone(item) });
        }
      }
    }
    return out;
  }

  async setItemCurrentPrice(itemId: string, currentPrice: number): Promise<void> {
    for (const w of this.store.values()) {
      const item = w.items.find((i) => i.id === itemId);
      if (item) {
        item.currentPrice = currentPrice;
        return;
      }
    }
  }
}

export class MemoryPriceAlertRepository implements IPriceAlertRepository {
  private readonly alerts = new Map<string, PriceTracking>();
  private readonly history = new Map<string, PriceHistoryPoint[]>();

  clear(): void {
    this.alerts.clear();
    this.history.clear();
  }

  seedHistory(productId: string, points: PriceHistoryPoint[]): void {
    this.history.set(productId, points.map((p) => structuredClone(p)));
  }

  async createAlert(a: PriceTracking): Promise<PriceTracking> {
    this.alerts.set(a.id, structuredClone(a));
    return structuredClone(a);
  }

  async findActiveAlertsByUser(userId: string): Promise<PriceTracking[]> {
    return [...this.alerts.values()]
      .filter((a) => a.userId === userId && a.isActive)
      .map((a) => structuredClone(a));
  }

  async findAllActiveAlerts(): Promise<PriceTracking[]> {
    return [...this.alerts.values()].filter((a) => a.isActive).map((a) => structuredClone(a));
  }

  async deleteAlert(id: string): Promise<boolean> {
    return this.alerts.delete(id);
  }

  async updateAlert(id: string, targetPrice: number, lastCheckedAt: string): Promise<PriceTracking | null> {
    const alert = this.alerts.get(id);
    if (!alert) return null;

    alert.targetPrice = targetPrice;
    alert.lastCheckedAt = lastCheckedAt;

    return structuredClone(alert);
  }

  async findPriceHistory(productId: string): Promise<PriceHistoryPoint[]> {
    return (this.history.get(productId) ?? []).map((p) => structuredClone(p));
  }
}

export class MemoryWishlistShareRepository implements IWishlistShareRepository {
  private readonly shares = new Map<string, WishlistShare>();
  private readonly collaborators = new Map<string, WishlistCollaborator[]>();
  private readonly activity = new Map<string, WishlistActivity[]>();

  clear(): void {
    this.shares.clear();
    this.collaborators.clear();
    this.activity.clear();
  }

  async createShare(s: WishlistShare): Promise<WishlistShare> {
    this.shares.set(s.shareToken, structuredClone(s));
    return structuredClone(s);
  }

  async findShareByToken(shareToken: string): Promise<WishlistShare | null> {
    const found = this.shares.get(shareToken);
    return found ? structuredClone(found) : null;
  }

  async addCollaborator(c: WishlistCollaborator): Promise<WishlistCollaborator> {
    const list = this.collaborators.get(c.wishlistId) ?? [];
    const existing = list.find((x) => x.userId === c.userId);

    // Upsert, matching the unique index in the schema.
    if (existing) {
      existing.email = c.email;
      existing.permission = c.permission;
      this.collaborators.set(c.wishlistId, list);
      return structuredClone(existing);
    }

    list.push(structuredClone(c));
    this.collaborators.set(c.wishlistId, list);
    return structuredClone(c);
  }

  async removeCollaborator(wishlistId: string, userId: string): Promise<boolean> {
    const list = this.collaborators.get(wishlistId) ?? [];
    const filtered = list.filter((c) => c.userId !== userId);
    this.collaborators.set(wishlistId, filtered);
    return filtered.length !== list.length;
  }

  async listCollaborators(wishlistId: string): Promise<WishlistCollaborator[]> {
    return (this.collaborators.get(wishlistId) ?? []).map((c) => structuredClone(c));
  }

  async logActivity(a: WishlistActivity): Promise<void> {
    const list = this.activity.get(a.wishlistId) ?? [];
    list.push(structuredClone(a));
    this.activity.set(a.wishlistId, list);
  }

  async listActivity(wishlistId: string): Promise<WishlistActivity[]> {
    return (this.activity.get(wishlistId) ?? []).map((a) => structuredClone(a));
  }
}
