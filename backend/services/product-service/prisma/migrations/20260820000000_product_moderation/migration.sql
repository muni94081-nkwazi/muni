-- ─── Product moderation (seller → admin approval → customer) ─────────────────
--
-- Adds the two states the approval flow needs and the columns that record who
-- moderated a listing, when, and why it was declined.
--
-- Backfill note: every existing row is ACTIVE, which is the correct outcome —
-- a catalogue that was already live should stay live. Only products created
-- after this migration enter the queue.
--
-- The index below was CONCURRENTLY, which cannot run inside a transaction
-- block; Prisma wraps every migration in one and v5 offers no opt-out, so this
-- migration could never be applied by `migrate deploy`. Dropped for the same
-- reason as in 20260817000000_composite_and_partial_indexes — see the note
-- there on restoring it out-of-band for a large live table.
--
-- Every statement here is guarded (IF NOT EXISTS / SET DEFAULT), so this file
-- is safe to re-run and safe to apply after a baseline that already contains
-- these columns.

-- ── New enum members ─────────────────────────────────────────────────────────
-- IF NOT EXISTS keeps this re-runnable; ALTER TYPE ADD VALUE is not
-- transactional and cannot be rolled back, so idempotency matters here.
ALTER TYPE "ProductStatus" ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL';
ALTER TYPE "ProductStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

-- ── Moderation columns ───────────────────────────────────────────────────────
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "moderatedAt"     TIMESTAMP(3);
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "moderatedBy"     TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "submittedAt"     TIMESTAMP(3);

-- ── Default flips to PENDING_APPROVAL ────────────────────────────────────────
-- A bulk import or manual INSERT that omits `status` must not publish straight
-- to the storefront. Existing rows are unaffected — a DEFAULT applies only to
-- future inserts.
ALTER TABLE "Product" ALTER COLUMN "status" SET DEFAULT 'PENDING_APPROVAL';

-- ── Moderation queue index ───────────────────────────────────────────────────
-- Admins page one status at a time, oldest submission first, so this is the
-- ascending mirror of the descending browse index and is not covered by it.
CREATE INDEX IF NOT EXISTS "Product_status_submittedAt_idx"
  ON "Product" ("status", "submittedAt" ASC);

-- Existing ACTIVE rows were never "submitted"; leaving submittedAt NULL for
-- them is accurate and keeps them out of any queue ordered by that column.
