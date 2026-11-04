-- Escrow holds become per (order, vendor) instead of one row per order.
--
-- `escrow_holds.order_id` carried a UNIQUE constraint, so a cart spanning
-- several vendors could only ever produce one hold: it named a single seller
-- and carried the entire cart's value. Every other seller was absent from the
-- ledger, and the named one looked owed money belonging to the others.
--
-- Existing rows are already unique on order_id, so they are trivially unique
-- on (order_id, vendor_id) too — no data migration or de-duplication is
-- needed, and no row changes meaning. Historical single-vendor holds stay
-- exactly as they are.

-- The unique index backing `order_id @unique`. Prisma names it
-- "escrow_holds_order_id_key"; drop it if present so this is safe to apply to
-- a database provisioned before the constraint was named that way.
DROP INDEX IF EXISTS "escrow_holds_order_id_key";

-- One hold per vendor per order. This is what keeps a retried payment
-- idempotent now that order_id alone no longer identifies a row.
CREATE UNIQUE INDEX IF NOT EXISTS "escrow_holds_order_id_vendor_id_key"
  ON "escrow_holds" ("order_id", "vendor_id");

-- order_id is no longer unique but is still the main lookup key: release,
-- freeze, status and the vendor split all fan out from an order.
CREATE INDEX IF NOT EXISTS "escrow_holds_order_id_idx"
  ON "escrow_holds" ("order_id");
