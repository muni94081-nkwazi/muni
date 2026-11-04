import { randomUUID } from 'node:crypto';
import type {
  Wishlist,
  WishlistActivity,
  WishlistCollaborator,
  WishlistShare,
} from '../models/wishlist.model.js';
import {
  prismaWishlistRepository,
  prismaWishlistShareRepository,
} from '../repositories/prisma-wishlist.repository.js';
import type { IWishlistRepository, IWishlistShareRepository } from '../types/repositories.js';

// ─── Wishlist sharing service ─────────────────────────────────────────────────
//
// Shares, collaborators and the activity feed live in Postgres. All three were
// Maps, so a share link handed to a friend stopped working the next time the
// service restarted.

export class WishlistShareService {
  constructor(
    private readonly repo: IWishlistShareRepository = prismaWishlistShareRepository,
    private readonly wishlists: IWishlistRepository = prismaWishlistRepository,
  ) {}

  async generateShareLink(wishlistId: string, permission: 'view' | 'edit' = 'view'): Promise<WishlistShare> {
    const shareToken = randomUUID().replace(/-/g, '').substring(0, 16);
    const ts = new Date().toISOString();

    return this.repo.createShare({
      id: randomUUID(),
      wishlistId,
      shareToken,
      permission,
      createdAt: ts,
    });
  }

  async getSharedWishlistByToken(shareToken: string): Promise<WishlistShare | null> {
    return this.repo.findShareByToken(shareToken);
  }

  async addCollaborator(
    wishlistId: string,
    userId: string,
    email?: string,
    permission: 'view' | 'edit' = 'edit',
  ): Promise<WishlistCollaborator> {
    const ts = new Date().toISOString();

    const collaborator = await this.repo.addCollaborator({
      id: randomUUID(),
      wishlistId,
      userId,
      email,
      permission,
      addedAt: ts,
    });

    await this.logActivity(wishlistId, userId, 'add_collaborator');

    return collaborator;
  }

  async removeCollaborator(wishlistId: string, userId: string): Promise<boolean> {
    return this.repo.removeCollaborator(wishlistId, userId);
  }

  async listCollaborators(wishlistId: string): Promise<WishlistCollaborator[]> {
    return this.repo.listCollaborators(wishlistId);
  }

  async listActivity(wishlistId: string): Promise<WishlistActivity[]> {
    return this.repo.listActivity(wishlistId);
  }

  /**
   * Copy someone else's list into your own account.
   *
   * The copy is now saved. The old implementation built the cloned object and
   * returned it without storing it anywhere, so the caller got a wishlist id
   * that did not exist and every follow-up request for it 404'd. A Map could
   * hide that as a transient oddity; handing out a permanent id for a row that
   * was never written cannot be hidden.
   */
  async copyWishlist(originalWishlist: Wishlist, targetUserId: string): Promise<Wishlist> {
    const ts = new Date();

    const cloned: Wishlist = {
      id: randomUUID(),
      userId: targetUserId,
      name: `Copy of ${originalWishlist.name}`,
      isPublic: false,
      items: originalWishlist.items.map((i) => ({ ...i, id: randomUUID(), addedAt: ts })),
      createdAt: ts,
      updatedAt: ts,
    };

    const saved = await this.wishlists.create(cloned);

    // create() writes the list itself; the items go in one at a time so each
    // gets its own row.
    for (const item of cloned.items) {
      await this.wishlists.addItem(saved.id, item, ts);
    }

    return (await this.wishlists.findOne(targetUserId, saved.id)) ?? saved;
  }

  private async logActivity(
    wishlistId: string,
    userId: string,
    action: 'add_item' | 'remove_item' | 'share' | 'add_collaborator',
  ): Promise<void> {
    await this.repo.logActivity({
      id: randomUUID(),
      wishlistId,
      userId,
      action,
      timestamp: new Date().toISOString(),
    });
  }
}

export const wishlistShareService = new WishlistShareService();
