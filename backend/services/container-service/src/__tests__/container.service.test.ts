import { describe, it, expect } from '@jest/globals';
import { containerService } from '../services/container.service.js';

// ─── Container merchandising ──────────────────────────────────────────────────
//
// Containers are the homepage's shelves. The service holds them in memory and
// seeds a default set at import, so this exercises real behaviour with no
// database — which is also why it is safe to run in CI.

describe('listContainers', () => {
  it('returns only active containers, in display order', async () => {
    const containers = await containerService.listContainers();

    expect(containers.length).toBeGreaterThan(0);
    expect(containers.every((c) => c.isActive)).toBe(true);

    const orders = containers.map((c) => c.sortOrder);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
  });
});

describe('getContainerBySlug', () => {
  it('finds a seeded container and returns null for an unknown slug', async () => {
    const all   = await containerService.listContainers();
    const first = all[0];

    await expect(containerService.getContainerBySlug(first.slug))
      .resolves.toMatchObject({ id: first.id });

    // null rather than a throw — a missing shelf is a 404, not a fault.
    await expect(containerService.getContainerBySlug('no-such-shelf'))
      .resolves.toBeNull();
  });
});

describe('addProductToContainer', () => {
  it('adds a product and does not duplicate it on re-add', async () => {
    const [container] = await containerService.listContainers();

    await containerService.addProductToContainer(container.id, 'prod-dupe-check');
    await containerService.addProductToContainer(container.id, 'prod-dupe-check');

    const updated = await containerService.getContainerBySlug(container.slug);
    const matches = updated!.products.filter((p) => p.productId === 'prod-dupe-check');

    // Pinning twice should move the product, not show it twice on the shelf.
    expect(matches).toHaveLength(1);
  });

  it('rejects an unknown container rather than silently creating one', async () => {
    await expect(
      containerService.addProductToContainer('c-does-not-exist', 'prod-1'),
    ).rejects.toThrow(/not found/i);
  });
});

describe('removeProductFromContainer', () => {
  it('removes a pinned product and tolerates an unknown container', async () => {
    const [container] = await containerService.listContainers();

    await containerService.addProductToContainer(container.id, 'prod-remove-me');
    await containerService.removeProductFromContainer(container.id, 'prod-remove-me');

    const updated = await containerService.getContainerBySlug(container.slug);
    expect(updated!.products.some((p) => p.productId === 'prod-remove-me')).toBe(false);

    await expect(
      containerService.removeProductFromContainer('c-does-not-exist', 'prod-1'),
    ).resolves.toBeUndefined();
  });
});
