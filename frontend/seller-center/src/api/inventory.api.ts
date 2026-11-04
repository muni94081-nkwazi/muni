import axiosInstance from './axios.config';

// ─── Seller Inventory API ─────────────────────────────────────────────────────
//
// Talks to inventory-service through the gateway's /api/v1/seller prefix, which
// carries requireRole('ROLE_SELLER', …). inventory-service registers every
// seller-facing route under BOTH /api/v1/inventory and /api/v1/seller/inventory
// (see backend/services/inventory-service/src/routes/paths.ts) because the
// gateway forwards req.originalUrl verbatim.
//
// This file previously returned hardcoded data — `getInventory` answered with a
// single fabricated "Product 1, stock 15" for every seller and `updateStock`
// returned `true` without issuing a request. Stock edits appeared to succeed and
// changed nothing. The backend routes it needed already existed; the comment at
// routes/paths.ts:12 records that they were fixed and that "the seller UI never
// noticed because it was reading mock data".
//
// ── Two things worth knowing about the endpoints ─────────────────────────────
//
// 1. Restock is PUT, not PATCH, and takes an ABSOLUTE stock level — RestockSchema
//    is `{ stock?, lowStockThreshold? }` (index.ts:64-70), not a delta.
//
// 2. `GET /seller/inventory` and `/alerts/low-stock` are NOT seller-scoped.
//    listInventory does `findMany({ where: { active: true } })` with no sellerId
//    filter, so it returns every variant on the platform. Each row carries
//    `product.sellerId`, so the filtering below keeps one seller from seeing
//    another's catalogue — but it is a client-side filter over a response that
//    should never have contained the other rows. **The server-side scoping is
//    the real fix and is not in this change.** Until it lands, treat the raw
//    endpoint as leaking cross-seller stock levels to any authenticated seller.

/** A variant row as inventory-service's formatVariant returns it (index.ts:277). */
export interface InventoryItem {
  id:                string;   // variant id — what the restock route addresses
  sku:               string;
  productId:         string;
  stock:             number;   // physical units
  reserved:          number;   // held by in-flight carts
  availableStock:    number;   // stock - reserved
  inStock:           boolean;
  isLowStock:        boolean;
  lowStockThreshold: number;
  attributes?:       Record<string, string>;
  product?:          { id: string; name: string; sellerId?: string };
}

interface InventoryEnvelope {
  success: boolean;
  data:    InventoryItem[];
  meta?:   { total: number; lowStock: number };
}

interface SingleVariantEnvelope {
  success: boolean;
  data:    InventoryItem;
}

/**
 * Keep only the rows belonging to this seller.
 *
 * When `sellerId` is not supplied the list is returned unfiltered — an admin
 * reusing this client should see everything, and silently returning nothing
 * would be the more confusing failure.
 */
function ownedBy(items: InventoryItem[], sellerId?: string): InventoryItem[] {
  if (!sellerId) return items;
  return items.filter((item) => item.product?.sellerId === sellerId);
}

export const inventoryApi = {
  /**
   * The seller's stock across every variant.
   *
   * `lowStockItems` is derived from the same response rather than fetched
   * separately: `isLowStock` is already computed per row by formatVariant, so a
   * second round-trip to /alerts/low-stock would return a subset of what is
   * already in hand.
   */
  getInventory: async (
    sellerId?: string,
  ): Promise<{ items: InventoryItem[]; lowStockItems: InventoryItem[] }> => {
    const { data } = await axiosInstance.get<InventoryEnvelope>('/seller/inventory');
    const items = ownedBy(data.data ?? [], sellerId);

    return { items, lowStockItems: items.filter((item) => item.isLowStock) };
  },

  /**
   * Set a variant's stock to an absolute level.
   *
   * Addressed by VARIANT id, not product id. The old signature took a
   * `productId`, which had nowhere to go — stock does not live on the product.
   */
  updateStock: async (variantId: string, stock: number): Promise<InventoryItem> => {
    const { data } = await axiosInstance.put<SingleVariantEnvelope>(
      `/seller/inventory/${encodeURIComponent(variantId)}`,
      { stock },
    );
    return data.data;
  },

  /** Raise or lower the threshold that flags a variant as low. */
  updateLowStockThreshold: async (
    variantId: string,
    lowStockThreshold: number,
  ): Promise<InventoryItem> => {
    const { data } = await axiosInstance.put<SingleVariantEnvelope>(
      `/seller/inventory/${encodeURIComponent(variantId)}`,
      { lowStockThreshold },
    );
    return data.data;
  },

  /** Variants at or below their low-stock threshold. */
  getLowStockAlerts: async (sellerId?: string): Promise<InventoryItem[]> => {
    const { data } = await axiosInstance.get<InventoryEnvelope>(
      '/seller/inventory/alerts/low-stock',
    );
    return ownedBy(data.data ?? [], sellerId);
  },

  /** Look a variant up by its SKU — the code a seller actually has to hand. */
  getBySku: async (sku: string): Promise<InventoryItem> => {
    const { data } = await axiosInstance.get<SingleVariantEnvelope>(
      `/seller/inventory/by-sku/${encodeURIComponent(sku)}`,
    );
    return data.data;
  },
};
