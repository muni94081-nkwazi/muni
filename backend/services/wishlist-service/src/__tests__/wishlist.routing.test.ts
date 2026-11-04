/**
 * wishlist.routing.test.ts
 *
 * Whether the wishlist API is reachable, and who it answers.
 *
 * Two defects sat behind the website's empty wishlist page:
 *
 *   1. The router was mounted at the root with relative paths, so the only
 *      request that matched `get('/')` was one sent to `/`. The gateway
 *      forwards req.originalUrl unchanged, so every real call to
 *      /api/v1/wishlists — the path both the web and mobile clients use —
 *      arrived as a 404. The whole CRUD surface was unreachable.
 *
 *   2. `requireAuth` existed but was wired to nothing, so res.locals.userId was
 *      never set and every controller fell through to a hardcoded 'user-123'.
 *      Any request without an identity operated on one shared fake account.
 *
 * These run the REAL router and the REAL auth middleware against the in-memory
 * repository, so they check the mounting and the guards rather than a
 * description of them.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.unstable_mockModule('../../../../shared/kafka/producer.js', () => ({
  publish: jest.fn<() => Promise<void>>().mockResolvedValue(),
  getProducer: jest.fn().mockReturnValue(null),
  connectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  disconnectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  isProducerReady: jest.fn<() => boolean>().mockReturnValue(true),
}));

jest.unstable_mockModule('../db/prisma.js', () => ({
  prisma: {}, connectDB: async () => undefined, disconnectDB: async () => undefined,
}));

const { MemoryWishlistRepository } = await import('../repositories/memory-wishlist.repository.js');
const { WishlistService } = await import('../services/wishlist.service.js');

// The controller imports the service singleton, so swap its repository for the
// in-memory one rather than standing up Postgres.
const memoryService = new WishlistService(new MemoryWishlistRepository() as never);
jest.unstable_mockModule('../services/wishlist.service.js', () => ({
  WishlistService,
  wishlistService: memoryService,
}));

const express = (await import('express')).default;
const request = (await import('supertest')).default;
const { wishlistRouter } = await import('../routes/index.js');

/** Mounted exactly as app.ts mounts it. */
function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/wishlists', wishlistRouter);
  return app;
}

const app = makeApp();

/** The header the gateway stamps after verifying a JWT. */
const asUser = (id: string) => ({ 'x-user-id': id });

const ITEM = {
  productId: 'prod-1',
  productName: 'Test Kettle',
  productImage: 'https://example.test/kettle.jpg',
  price: 45000,
};

async function createListFor(userId: string) {
  const res = await request(app).post('/api/v1/wishlists').set(asUser(userId)).send({ name: 'My Wishlist' });
  return res.body.data as { id: string; items: Array<{ id: string }> };
}

beforeEach(() => {
  // Fresh repository per test so lists do not leak between cases.
  (memoryService as unknown as { repo: unknown }).repo = new MemoryWishlistRepository();
});

describe('the wishlist API is reachable at the path clients call', () => {
  it('answers GET /api/v1/wishlists rather than 404', async () => {
    const res = await request(app).get('/api/v1/wishlists').set(asUser('cust-A'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('creates a wishlist at POST /api/v1/wishlists', async () => {
    const res = await request(app).post('/api/v1/wishlists').set(asUser('cust-A')).send({ name: 'My Wishlist' });

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('My Wishlist');
  });

  it('adds and removes items on the nested item paths', async () => {
    const list = await createListFor('cust-A');

    const added = await request(app)
      .post(`/api/v1/wishlists/${list.id}/items`).set(asUser('cust-A')).send(ITEM);
    expect(added.status).toBe(200);
    expect(added.body.data.items).toHaveLength(1);

    const itemId = added.body.data.items[0].id;
    const removed = await request(app)
      .delete(`/api/v1/wishlists/${list.id}/items/${itemId}`).set(asUser('cust-A'));

    expect(removed.status).toBe(200);
    expect(removed.body.data.items).toHaveLength(0);
  });
});

describe('every user-scoped route requires an authenticated identity', () => {
  it('401s a list read with no identity', async () => {
    const res = await request(app).get('/api/v1/wishlists');
    expect(res.status).toBe(401);
  });

  it('401s a create with no identity', async () => {
    const res = await request(app).post('/api/v1/wishlists').send({ name: 'X' });
    expect(res.status).toBe(401);
  });

  it('401s an add with no identity', async () => {
    const list = await createListFor('cust-A');
    const res = await request(app).post(`/api/v1/wishlists/${list.id}/items`).send(ITEM);
    expect(res.status).toBe(401);
  });

  it('401s a remove with no identity', async () => {
    const list = await createListFor('cust-A');
    const added = await request(app)
      .post(`/api/v1/wishlists/${list.id}/items`).set(asUser('cust-A')).send(ITEM);

    const res = await request(app)
      .delete(`/api/v1/wishlists/${list.id}/items/${added.body.data.items[0].id}`);

    expect(res.status).toBe(401);
  });

  it('never falls back to the old hardcoded user-123 account', async () => {
    // Under the old controller this returned 200 and user-123's list.
    const res = await request(app).get('/api/v1/wishlists');

    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).not.toContain('user-123');
  });
});

describe('one customer cannot reach another customer’s wishlist', () => {
  it('shows B an empty list while A has items', async () => {
    const list = await createListFor('cust-A');
    await request(app).post(`/api/v1/wishlists/${list.id}/items`).set(asUser('cust-A')).send(ITEM);

    const res = await request(app).get('/api/v1/wishlists').set(asUser('cust-B'));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it('refuses B adding an item to A’s wishlist', async () => {
    const list = await createListFor('cust-A');

    const res = await request(app)
      .post(`/api/v1/wishlists/${list.id}/items`).set(asUser('cust-B')).send(ITEM);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not found/i);
  });

  it('refuses B removing an item from A’s wishlist, and A keeps it', async () => {
    const list = await createListFor('cust-A');
    const added = await request(app)
      .post(`/api/v1/wishlists/${list.id}/items`).set(asUser('cust-A')).send(ITEM);
    const itemId = added.body.data.items[0].id;

    const res = await request(app)
      .delete(`/api/v1/wishlists/${list.id}/items/${itemId}`).set(asUser('cust-B'));
    expect(res.status).toBe(400);

    const stillThere = await request(app).get('/api/v1/wishlists').set(asUser('cust-A'));
    expect(stillThere.body.data[0].items).toHaveLength(1);
  });

  it('ignores a userId in the body — identity is the stamped header', async () => {
    const list = await createListFor('cust-A');

    await request(app)
      .post(`/api/v1/wishlists/${list.id}/items`)
      .set(asUser('cust-B'))
      .send({ ...ITEM, userId: 'cust-A' });

    // The body claim must not have let B write into A's list.
    const aList = await request(app).get('/api/v1/wishlists').set(asUser('cust-A'));
    expect(aList.body.data[0].items).toHaveLength(0);
  });
});

describe('bad input is handled rather than crashing', () => {
  it('400s adding to a wishlist id that does not exist', async () => {
    const res = await request(app)
      .post('/api/v1/wishlists/does-not-exist/items').set(asUser('cust-A')).send(ITEM);

    expect(res.status).toBe(400);
  });

  it('treats removing an unknown item as a no-op, not an error', async () => {
    // The repository returns the wishlist unchanged with `removed: null` rather
    // than throwing, which is ordinary idempotent-DELETE behaviour: asking twice
    // for something to be gone should not fail the second time. Asserted as it
    // actually behaves rather than changing the service to match a guess.
    const list = await createListFor('cust-A');
    await request(app).post(`/api/v1/wishlists/${list.id}/items`).set(asUser('cust-A')).send(ITEM);

    const res = await request(app)
      .delete(`/api/v1/wishlists/${list.id}/items/no-such-item`).set(asUser('cust-A'));

    expect(res.status).toBe(200);
    // The real item is untouched — a bad id removes nothing.
    expect(res.body.data.items).toHaveLength(1);
  });

  it('400s an item payload missing required fields', async () => {
    const list = await createListFor('cust-A');

    const res = await request(app)
      .post(`/api/v1/wishlists/${list.id}/items`).set(asUser('cust-A')).send({ productId: 'p-1' });

    expect(res.status).toBe(400);
  });
});
