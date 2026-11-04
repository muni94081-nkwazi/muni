import { describe, it, expect } from '@jest/globals';
import {
  INVENTORY_PREFIXES,
  sellerInventoryPaths,
  internalInventoryPaths,
} from '../routes/paths.js';

// ─── Seller inventory reachability ────────────────────────────────────────────
//
// Regression guard for a bug that made every seller stock request 404.
//
// The gateway mounts `route('/inventory', targets.inventory)` under
// /api/v1/seller and forwards req.originalUrl verbatim, so requests arrive
// here as /api/v1/seller/inventory/… This service served only
// /api/v1/inventory/*, so nothing matched. The seller UI never surfaced it
// because it was reading mock data.
//
// These assert the shape of the fix rather than issuing HTTP: index.ts calls
// `start()` at module scope (connecting Prisma and binding a port), so it
// cannot be imported into a unit test. Pulling the path construction into its
// own module is what makes the arrangement assertable at all.

describe('INVENTORY_PREFIXES', () => {
  it('serves both the bare and the seller-namespaced prefix', () => {
    expect([...INVENTORY_PREFIXES]).toEqual([
      '/api/v1/inventory',
      '/api/v1/seller/inventory',
    ]);
  });

  it('keeps the bare prefix — internal callers already use it', () => {
    // order-service's catalog client and checkout-service's saga both call
    // /api/v1/inventory directly. This is an alias, not a rename.
    expect(INVENTORY_PREFIXES).toContain('/api/v1/inventory');
  });

  it('includes the prefix the gateway actually forwards', () => {
    expect(INVENTORY_PREFIXES).toContain('/api/v1/seller/inventory');
  });
});

describe('sellerInventoryPaths', () => {
  it('builds every seller-facing route under a given prefix', () => {
    expect(sellerInventoryPaths('/api/v1/seller/inventory')).toEqual({
      list:      '/api/v1/seller/inventory',
      bySku:     '/api/v1/seller/inventory/by-sku/:sku',
      lowStock:  '/api/v1/seller/inventory/alerts/low-stock',
      byVariant: '/api/v1/seller/inventory/:variantId',
    });
  });

  it('produces the same route set for both prefixes', () => {
    const [bare, seller] = INVENTORY_PREFIXES.map(sellerInventoryPaths);

    // Same keys, so a seller can reach everything an internal caller can read.
    expect(Object.keys(seller)).toEqual(Object.keys(bare));
  });

  it('does not collide a literal segment with the :variantId param', () => {
    const path = sellerInventoryPaths('/api/v1/seller/inventory');

    // `/by-sku/:sku` and `/alerts/low-stock` are three segments deep while
    // `/:variantId` is two, so Express cannot capture "by-sku" or "alerts" as
    // a variant id regardless of registration order.
    const depth = (p: string) => p.split('/').length;
    expect(depth(path.bySku)).toBeGreaterThan(depth(path.byVariant));
    expect(depth(path.lowStock)).toBeGreaterThan(depth(path.byVariant));
  });
});

describe('internalInventoryPaths', () => {
  it('is not part of the seller-facing set', () => {
    // reserve/release/deduct move stock and are guarded by
    // requireInternalCaller. Aliasing them under /seller would widen the
    // surface of the three routes that most need to stay narrow.
    const sellerPaths = Object.values(sellerInventoryPaths('/api/v1/inventory'));

    for (const internal of internalInventoryPaths('/api/v1/inventory')) {
      expect(sellerPaths).not.toContain(internal);
    }
  });

  it('names the three stock-moving routes', () => {
    expect(internalInventoryPaths('/api/v1/inventory')).toEqual([
      '/api/v1/inventory/:variantId/reserve',
      '/api/v1/inventory/:variantId/release',
      '/api/v1/inventory/:variantId/deduct',
    ]);
  });
});
