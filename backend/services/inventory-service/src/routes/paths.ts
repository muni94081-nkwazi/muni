// ─── Route paths ──────────────────────────────────────────────────────────────
//
// Extracted so the two-prefix arrangement is a thing that can be asserted on,
// rather than a loop buried in index.ts that a future edit could quietly
// unpick.
//
// Why two prefixes: the gateway mounts `route('/inventory', targets.inventory)`
// under /api/v1/seller and forwards req.originalUrl verbatim (there is no path
// rewriting in api-gateway/src/utils/proxy.ts), so a seller asking for their
// stock arrives here as /api/v1/seller/inventory/… Serving only
// /api/v1/inventory/* meant every seller inventory request 404'd, and the
// seller UI never noticed because it was reading mock data.
//
// Aliased rather than renamed: internal callers (order-service's catalog
// client, checkout-service's saga) already use the bare prefix.

/** Both prefixes the seller-facing inventory routes answer on. */
export const INVENTORY_PREFIXES = [
  '/api/v1/inventory',
  '/api/v1/seller/inventory',
] as const;

/**
 * The seller-facing route paths for one prefix.
 *
 * Reserve, release and deduct are deliberately absent. They are
 * service-to-service steps behind `requireInternalCaller`, and there is no
 * reason to widen their surface to a second path — a seller has no business
 * calling them at all.
 */
export function sellerInventoryPaths(prefix: string): {
  list: string;
  bySku: string;
  lowStock: string;
  byVariant: string;
} {
  return {
    list:      prefix,
    bySku:     `${prefix}/by-sku/:sku`,
    lowStock:  `${prefix}/alerts/low-stock`,
    byVariant: `${prefix}/:variantId`,
  };
}

/** Paths that must stay on the bare prefix only. */
export function internalInventoryPaths(prefix: string): string[] {
  return [
    `${prefix}/:variantId/reserve`,
    `${prefix}/:variantId/release`,
    `${prefix}/:variantId/deduct`,
  ];
}
