// node:crypto rather than the uuid package: uuid is declared in package.json
// but absent from package-lock.json, so `npm ci` never installs it and the
// container would crash on first import. 41 files here already use randomUUID.
import { randomUUID as uuidv4 } from 'node:crypto';
import { Wishlist, WishlistItem, createWishlistSchema, updateWishlistSchema, addWishlistItemSchema } from '../models/wishlist.model.js';
import { logger } from '../utils/logger.js';
import { getProducer } from '../../../../shared/kafka/producer.js';
import { prismaWishlistRepository } from '../repositories/prisma-wishlist.repository.js';
import type { IWishlistRepository } from '../types/repositories.js';

// ─── Wishlist service ─────────────────────────────────────────────────────────
//
// State lives in Postgres behind IWishlistRepository. It was a nested
// `Map<userId, Map<wishlistId, Wishlist>>`, so the list a customer built up
// over weeks disappeared on the next restart.
//
// Every read method became async — they were synchronous only because a Map
// lookup is. The controllers gained await to match.

export class WishlistService {
  constructor(private readonly repo: IWishlistRepository = prismaWishlistRepository) {}

  public async getWishlistsByUser(userId: string): Promise<Wishlist[]> {
    return this.repo.findByUser(userId);
  }

  public async getWishlist(userId: string, id: string): Promise<Wishlist | undefined> {
    return this.repo.findOne(userId, id);
  }

  public async getPublicWishlist(id: string): Promise<Wishlist | undefined> {
    return this.repo.findPublic(id);
  }

  public async createWishlist(userId: string, data: any): Promise<Wishlist> {
    const validated = createWishlistSchema.parse(data);
    const now = new Date();

    return this.repo.create({
      id: uuidv4(),
      userId,
      name: validated.name,
      isPublic: validated.isPublic,
      items: [],
      createdAt: now,
      updatedAt: now,
    });
  }

  public async updateWishlist(userId: string, id: string, data: any): Promise<Wishlist> {
    const validated = updateWishlistSchema.parse(data);

    const updated = await this.repo.update(userId, id, validated, new Date());
    if (!updated) throw new Error('Wishlist not found');

    return updated;
  }

  public async deleteWishlist(userId: string, id: string): Promise<void> {
    const removed = await this.repo.remove(userId, id);
    if (!removed) throw new Error('Wishlist not found');
  }

  public async addItem(userId: string, wishlistId: string, data: any): Promise<Wishlist> {
    const owned = await this.repo.findOne(userId, wishlistId);
    if (!owned) throw new Error('Wishlist not found');

    const validated = addWishlistItemSchema.parse(data);

    const newItem: WishlistItem = {
      id: uuidv4(),
      productId: validated.productId,
      productName: validated.productName,
      productImage: validated.productImage,
      price: validated.price,
      addedAt: new Date(),
      priceAtAdd: validated.price,
      currentPrice: validated.price,
    };

    const result = await this.repo.addItem(wishlistId, newItem, new Date());
    if (!result) throw new Error('Wishlist not found');

    // Only on an actual insert. A product already on the list was a silent
    // no-op before, and firing item.added for it would tell notification
    // consumers something happened that did not.
    if (result.added) {
      await this.publishEvent('item.added', { userId, wishlistId, item: newItem });
    }

    return result.wishlist;
  }

  public async removeItem(userId: string, wishlistId: string, itemId: string): Promise<Wishlist> {
    const owned = await this.repo.findOne(userId, wishlistId);
    if (!owned) throw new Error('Wishlist not found');

    const result = await this.repo.removeItem(wishlistId, itemId, new Date());
    if (!result) throw new Error('Wishlist not found');

    if (result.removed) {
      await this.publishEvent('item.removed', { userId, wishlistId, item: result.removed });
    }

    return result.wishlist;
  }

  public async moveItem(userId: string, sourceId: string, targetId: string, itemId: string): Promise<void> {
    // One transaction in the repository: the original spliced the item out of
    // the source and pushed it onto the target as two separate steps, so an
    // interruption between them lost the item entirely.
    await this.repo.moveItem(userId, sourceId, targetId, itemId, new Date());
  }

  public async handleProductPriceUpdate(productId: string, newPrice: number): Promise<void> {
    logger.info(`Handling price update for product ${productId} to ${newPrice}`);

    // An indexed lookup, rather than the nested scan over every user's every
    // list the Map version ran on each price update.
    const holdings = await this.repo.findItemsByProduct(productId);

    for (const { userId, wishlistId, item } of holdings) {
      const oldPrice = item.currentPrice;
      await this.repo.setItemCurrentPrice(item.id, newPrice);

      if (newPrice < oldPrice) {
        await this.publishEvent('price.drop.alert', {
          userId,
          productId,
          oldPrice,
          newPrice,
          wishlistId,
        });
      }
    }
  }

  private async publishEvent(type: string, payload: any) {
    try {
      const producer = getProducer();
      if (producer) {
        await producer.send({
          topic: 'wishlist-events',
          messages: [{ value: JSON.stringify({ type, payload }) }],
        });
      }
    } catch (err) {
      logger.error(`Failed to publish ${type} event`, err);
    }
  }
}

export const wishlistService = new WishlistService();
