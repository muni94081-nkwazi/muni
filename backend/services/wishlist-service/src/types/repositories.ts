import type {
  PriceHistoryPoint,
  PriceTracking,
  Wishlist,
  WishlistActivity,
  WishlistCollaborator,
  WishlistItem,
  WishlistShare,
} from '../models/wishlist.model.js';

// ─── Repository contracts ─────────────────────────────────────────────────────
//
// Three services, three contracts, one database. Each replaces Maps that were
// read and written by mutating whatever object the service had already
// fetched — which persisted only because it was the same object.

export interface IWishlistRepository {
  create(wishlist: Wishlist): Promise<Wishlist>;

  findByUser(userId: string): Promise<Wishlist[]>;

  findOne(userId: string, id: string): Promise<Wishlist | undefined>;

  /** A list by id, but only if its owner has made it public. */
  findPublic(id: string): Promise<Wishlist | undefined>;

  update(
    userId: string,
    id: string,
    patch: Partial<Pick<Wishlist, 'name' | 'isPublic'>>,
    updatedAt: Date,
  ): Promise<Wishlist | undefined>;

  /** False when the list did not exist, which the service turns into a throw. */
  remove(userId: string, id: string): Promise<boolean>;

  /**
   * Add an item unless the product is already on the list.
   *
   * Returns the list either way, matching the original's silent no-op on a
   * duplicate. `added` says which happened so the caller knows whether to
   * publish an event.
   */
  addItem(
    wishlistId: string,
    item: WishlistItem,
    updatedAt: Date,
  ): Promise<{ wishlist: Wishlist; added: boolean } | undefined>;

  /** Returns the removed item, or null if the list had no such item. */
  removeItem(
    wishlistId: string,
    itemId: string,
    updatedAt: Date,
  ): Promise<{ wishlist: Wishlist; removed: WishlistItem | null } | undefined>;

  /** Move one item between two of the same user's lists, in one transaction. */
  moveItem(
    userId: string,
    sourceId: string,
    targetId: string,
    itemId: string,
    updatedAt: Date,
  ): Promise<void>;

  /** Every item for a product, across all lists — the price-update fan-out. */
  findItemsByProduct(productId: string): Promise<Array<{ userId: string; wishlistId: string; item: WishlistItem }>>;

  setItemCurrentPrice(itemId: string, currentPrice: number): Promise<void>;
}

export interface IPriceAlertRepository {
  createAlert(alert: PriceTracking): Promise<PriceTracking>;
  findActiveAlertsByUser(userId: string): Promise<PriceTracking[]>;
  findAllActiveAlerts(): Promise<PriceTracking[]>;
  deleteAlert(id: string): Promise<boolean>;
  updateAlert(id: string, targetPrice: number, lastCheckedAt: string): Promise<PriceTracking | null>;
  findPriceHistory(productId: string): Promise<PriceHistoryPoint[]>;
}

export interface IWishlistShareRepository {
  createShare(share: WishlistShare): Promise<WishlistShare>;
  findShareByToken(shareToken: string): Promise<WishlistShare | null>;

  /** Upsert on (wishlistId, userId) — re-inviting someone updates them. */
  addCollaborator(collaborator: WishlistCollaborator): Promise<WishlistCollaborator>;
  removeCollaborator(wishlistId: string, userId: string): Promise<boolean>;
  listCollaborators(wishlistId: string): Promise<WishlistCollaborator[]>;

  logActivity(activity: WishlistActivity): Promise<void>;
  listActivity(wishlistId: string): Promise<WishlistActivity[]>;
}
