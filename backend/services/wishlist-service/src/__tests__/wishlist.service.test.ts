import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.unstable_mockModule('../../../../shared/kafka/producer.js', () => ({
  publish: jest.fn<() => Promise<void>>().mockResolvedValue(),
  getProducer: jest.fn().mockReturnValue(null),
  connectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  disconnectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  isProducerReady: jest.fn<() => boolean>().mockReturnValue(true),
}));

const {
  MemoryWishlistRepository,
  MemoryPriceAlertRepository,
  MemoryWishlistShareRepository,
} = await import('../repositories/memory-wishlist.repository.js');
const { WishlistService } = await import('../services/wishlist.service.js');
const { PriceAlertService } = await import('../services/price-alert.service.js');
const { WishlistShareService } = await import('../services/wishlist-share.service.js');

const USER = 'user-1';
const OTHER = 'user-2';

let repo: InstanceType<typeof MemoryWishlistRepository>;
let service: InstanceType<typeof WishlistService>;
let alerts: InstanceType<typeof MemoryPriceAlertRepository>;
let alertService: InstanceType<typeof PriceAlertService>;
let shareRepo: InstanceType<typeof MemoryWishlistShareRepository>;
let shareService: InstanceType<typeof WishlistShareService>;

beforeEach(() => {
  repo = new MemoryWishlistRepository();
  service = new WishlistService(repo);
  alerts = new MemoryPriceAlertRepository();
  alertService = new PriceAlertService(alerts);
  shareRepo = new MemoryWishlistShareRepository();
  shareService = new WishlistShareService(shareRepo, repo);
});

const item = (productId = 'p1') => ({
  productId,
  productName: 'Galaxy S24',
  productImage: 'https://muni.ug/i.jpg',
  price: 4_200_000,
});

describe('WishlistService against a repository', () => {
  it('creates a list and reads it back', async () => {
    const list = await service.createWishlist(USER, { name: 'Birthday', isPublic: false });

    expect(list.name).toBe('Birthday');
    expect(await repo.findOne(USER, list.id)).toBeDefined();
  });

  it('scopes lists to their owner', async () => {
    const list = await service.createWishlist(USER, {});

    expect(await service.getWishlist(USER, list.id)).toBeDefined();
    // The nested Map made cross-user access structurally impossible; the
    // query has to enforce it explicitly now.
    expect(await service.getWishlist(OTHER, list.id)).toBeUndefined();
  });

  it('only exposes a public list through getPublicWishlist', async () => {
    const priv = await service.createWishlist(USER, { isPublic: false });
    const pub = await service.createWishlist(USER, { isPublic: true });

    expect(await service.getPublicWishlist(priv.id)).toBeUndefined();
    expect(await service.getPublicWishlist(pub.id)).toBeDefined();
  });

  it('updates name and visibility, persistently', async () => {
    const list = await service.createWishlist(USER, {});

    await service.updateWishlist(USER, list.id, { name: 'Renamed', isPublic: true });

    const reloaded = await repo.findOne(USER, list.id);
    expect(reloaded!.name).toBe('Renamed');
    expect(reloaded!.isPublic).toBe(true);
  });

  it('refuses to update or delete a list belonging to someone else', async () => {
    const list = await service.createWishlist(USER, {});

    await expect(service.updateWishlist(OTHER, list.id, { name: 'x' })).rejects.toThrow('Wishlist not found');
    await expect(service.deleteWishlist(OTHER, list.id)).rejects.toThrow('Wishlist not found');
  });

  it('deletes a list', async () => {
    const list = await service.createWishlist(USER, {});
    await service.deleteWishlist(USER, list.id);

    expect(await repo.findOne(USER, list.id)).toBeUndefined();
  });

  describe('items', () => {
    it('adds an item and persists it', async () => {
      const list = await service.createWishlist(USER, {});

      const updated = await service.addItem(USER, list.id, item());

      expect(updated.items).toHaveLength(1);
      expect((await repo.findOne(USER, list.id))!.items).toHaveLength(1);
    });

    it('silently ignores a product already on the list', async () => {
      const list = await service.createWishlist(USER, {});
      await service.addItem(USER, list.id, item());

      const again = await service.addItem(USER, list.id, item());
      expect(again.items).toHaveLength(1);
    });

    it('removes an item', async () => {
      const list = await service.createWishlist(USER, {});
      const withItem = await service.addItem(USER, list.id, item());

      const after = await service.removeItem(USER, list.id, withItem.items[0]!.id);
      expect(after.items).toHaveLength(0);
    });

    it('moves an item between two of the same user’s lists', async () => {
      const a = await service.createWishlist(USER, { name: 'A' });
      const b = await service.createWishlist(USER, { name: 'B' });
      const withItem = await service.addItem(USER, a.id, item());

      await service.moveItem(USER, a.id, b.id, withItem.items[0]!.id);

      expect((await repo.findOne(USER, a.id))!.items).toHaveLength(0);
      expect((await repo.findOne(USER, b.id))!.items).toHaveLength(1);
    });

    it('drops the item when the target list already holds that product', async () => {
      const a = await service.createWishlist(USER, { name: 'A' });
      const b = await service.createWishlist(USER, { name: 'B' });
      const withItem = await service.addItem(USER, a.id, item());
      await service.addItem(USER, b.id, item());

      await service.moveItem(USER, a.id, b.id, withItem.items[0]!.id);

      expect((await repo.findOne(USER, a.id))!.items).toHaveLength(0);
      expect((await repo.findOne(USER, b.id))!.items).toHaveLength(1);
    });
  });

  describe('price updates', () => {
    it('rewrites currentPrice on every list holding the product', async () => {
      const a = await service.createWishlist(USER, { name: 'A' });
      const b = await service.createWishlist(OTHER, { name: 'B' });
      await service.addItem(USER, a.id, item('p1'));
      await service.addItem(OTHER, b.id, item('p1'));

      await service.handleProductPriceUpdate('p1', 3_900_000);

      expect((await repo.findOne(USER, a.id))!.items[0]!.currentPrice).toBe(3_900_000);
      expect((await repo.findOne(OTHER, b.id))!.items[0]!.currentPrice).toBe(3_900_000);
    });

    it('leaves priceAtAdd alone so a drop stays measurable', async () => {
      const list = await service.createWishlist(USER, {});
      await service.addItem(USER, list.id, item('p1'));

      await service.handleProductPriceUpdate('p1', 3_900_000);

      const stored = (await repo.findOne(USER, list.id))!.items[0]!;
      expect(stored.priceAtAdd).toBe(4_200_000);
      expect(stored.currentPrice).toBe(3_900_000);
    });
  });
});

describe('PriceAlertService', () => {
  it('persists an alert and lists it back', async () => {
    const alert = await alertService.setPriceAlert(USER, 'p1', 'Galaxy', 3_500_000);

    expect(alert.isActive).toBe(true);
    expect(await alertService.listUserAlerts(USER)).toHaveLength(1);
  });

  it('updates the target price', async () => {
    const alert = await alertService.setPriceAlert(USER, 'p1', 'Galaxy', 3_500_000);

    const updated = await alertService.updateAlert(alert.id, 3_000_000);
    expect(updated!.targetPrice).toBe(3_000_000);
  });

  it('deletes an alert', async () => {
    const alert = await alertService.setPriceAlert(USER, 'p1', 'Galaxy', 3_500_000);

    expect(await alertService.deleteAlert(alert.id)).toBe(true);
    expect(await alertService.listUserAlerts(USER)).toHaveLength(0);
  });

  it('returns an empty history rather than inventing a data point', async () => {
    // The old code returned a single fabricated 100,000 UGX point for any
    // product it had no history for, which drew a flat line that looked real.
    expect(await alertService.getPriceHistory('unknown-product')).toEqual([]);
  });

  it('returns recorded history when there is some', async () => {
    alerts.seedHistory('p1', [
      { id: 'ph-1', productId: 'p1', price: 4_500_000, currency: 'UGX', timestamp: '2026-07-01T00:00:00.000Z' },
    ]);

    expect(await alertService.getPriceHistory('p1')).toHaveLength(1);
  });
});

describe('WishlistShareService', () => {
  it('generates a share link resolvable by token', async () => {
    const share = await shareService.generateShareLink('wl-1', 'view');

    expect(share.shareToken).toHaveLength(16);
    expect(await shareService.getSharedWishlistByToken(share.shareToken)).not.toBeNull();
  });

  it('adds a collaborator and logs the activity', async () => {
    await shareService.addCollaborator('wl-1', USER, 'a@muni.ug', 'edit');

    expect(await shareService.listCollaborators('wl-1')).toHaveLength(1);
    expect(await shareService.listActivity('wl-1')).toHaveLength(1);
  });

  it('re-inviting someone updates them rather than duplicating', async () => {
    await shareService.addCollaborator('wl-1', USER, 'a@muni.ug', 'view');
    await shareService.addCollaborator('wl-1', USER, 'a@muni.ug', 'edit');

    const collaborators = await shareService.listCollaborators('wl-1');
    expect(collaborators).toHaveLength(1);
    expect(collaborators[0]!.permission).toBe('edit');
  });

  it('removes a collaborator', async () => {
    await shareService.addCollaborator('wl-1', USER);

    expect(await shareService.removeCollaborator('wl-1', USER)).toBe(true);
    expect(await shareService.listCollaborators('wl-1')).toHaveLength(0);
  });

  it('saves the copied wishlist so its id actually resolves', async () => {
    // The old implementation returned the clone without storing it, so the
    // caller got an id that 404'd on the very next request.
    const original = await service.createWishlist(USER, { name: 'Wanted', isPublic: true });
    await service.addItem(USER, original.id, item('p1'));
    const full = (await repo.findOne(USER, original.id))!;

    const copy = await shareService.copyWishlist(full, OTHER);

    expect(copy.name).toBe('Copy of Wanted');
    expect(copy.userId).toBe(OTHER);
    expect(copy.isPublic).toBe(false);

    const reloaded = await repo.findOne(OTHER, copy.id);
    expect(reloaded).toBeDefined();
    expect(reloaded!.items).toHaveLength(1);
  });
});
