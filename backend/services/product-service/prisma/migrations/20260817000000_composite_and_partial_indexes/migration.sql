-- ─── Composite + partial indexes (audit H6) ──────────────────────────────────
--
-- These index builds take an ACCESS EXCLUSIVE lock on Product and
-- ProductVariant for their duration, blocking reads and writes on the
-- catalogue while they run.
--
-- They were originally written CONCURRENTLY to avoid exactly that. But
-- CONCURRENTLY cannot run inside a transaction block, Prisma wraps every
-- migration in one, and v5 has no per-migration opt-out — so this migration
-- failed with SQLSTATE 25001 on every attempt and had never been applied
-- anywhere. A migration that locks briefly beats one that does not run at all.
--
-- The lock is negligible on a small catalogue. Before running this against a
-- large live table, apply these statements out-of-band with CONCURRENTLY
-- restored (psql -f, outside a transaction), then mark the migration applied
-- with `prisma migrate resolve --applied 20260817000000_composite_and_partial_indexes`.
-- The IF NOT EXISTS / IF EXISTS guards throughout make that safe.

-- ── Drop indexes the composites below now subsume ────────────────────────────
-- Every extra index is paid for on every INSERT and UPDATE. These four are
-- fully covered as prefixes of the new composites.
DROP INDEX IF EXISTS "Product_status_idx";
DROP INDEX IF EXISTS "Product_createdAt_idx";
DROP INDEX IF EXISTS "Product_averageRating_idx";
DROP INDEX IF EXISTS "Product_sellerId_idx";
-- Redundant with the UNIQUE constraint on sku.
DROP INDEX IF EXISTS "ProductVariant_sku_idx";
DROP INDEX IF EXISTS "ProductVariant_stock_idx";
DROP INDEX IF EXISTS "ProductVariant_productId_idx";

-- ── Composites, most selective column first ──────────────────────────────────
CREATE INDEX IF NOT EXISTS "Product_status_createdAt_idx"
  ON "Product" ("status", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "Product_status_categoryId_basePrice_idx"
  ON "Product" ("status", "categoryId", "basePrice");

CREATE INDEX IF NOT EXISTS "Product_status_averageRating_idx"
  ON "Product" ("status", "averageRating" DESC);

CREATE INDEX IF NOT EXISTS "Product_sellerId_status_createdAt_idx"
  ON "Product" ("sellerId", "status", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "ProductVariant_productId_active_idx"
  ON "ProductVariant" ("productId", "active");

CREATE INDEX IF NOT EXISTS "ProductVariant_active_stock_idx"
  ON "ProductVariant" ("active", "stock");

CREATE INDEX IF NOT EXISTS "InventoryReservation_sessionId_variantId_idx"
  ON "InventoryReservation" ("sessionId", "variantId");

-- ── Partial indexes ──────────────────────────────────────────────────────────
--
-- Storefront queries only ever look at ACTIVE rows. Indexing only those keeps
-- the index small enough to stay in cache and removes archived/draft rows from
-- the write path entirely — the soft-delete equivalent the audit called for.

CREATE INDEX IF NOT EXISTS "Product_active_recent_partial_idx"
  ON "Product" ("createdAt" DESC)
  WHERE "status" = 'ACTIVE';

CREATE INDEX IF NOT EXISTS "Product_active_category_price_partial_idx"
  ON "Product" ("categoryId", "basePrice")
  WHERE "status" = 'ACTIVE';

-- Only variants with sellable stock matter for availability checks.
CREATE INDEX IF NOT EXISTS "ProductVariant_sellable_partial_idx"
  ON "ProductVariant" ("productId")
  WHERE "active" = true AND "stock" > "reserved";

-- Expiry sweeps only ever scan forward from now(); indexing all reservations
-- including long-expired ones wastes space the sweep immediately deletes.
CREATE INDEX IF NOT EXISTS "InventoryReservation_expiry_sweep_idx"
  ON "InventoryReservation" ("expiresAt");

-- ── Trigram index for the degraded search fallback ───────────────────────────
--
-- When Elasticsearch is unavailable, product-service falls back to a SQL
-- name match. A B-tree cannot serve a leading wildcard, so without this the
-- fallback is a sequential scan of the whole catalogue. GIN + pg_trgm makes
-- ILIKE '%term%' index-assisted.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "Product_name_trgm_idx"
  ON "Product" USING GIN ("name" gin_trgm_ops);
