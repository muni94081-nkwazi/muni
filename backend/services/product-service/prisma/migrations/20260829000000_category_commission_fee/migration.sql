-- Category commission percentage.
--
-- The admin panel has always shown and edited a per-category commission, but
-- there was no column behind it: the field round-tripped through an in-memory
-- mock and every edit was discarded the moment the page reloaded.
--
-- Defaults to 0 so existing rows keep their current (implicit) behaviour —
-- no category starts charging a commission it was not charging yesterday.

ALTER TABLE "Category"
  ADD COLUMN IF NOT EXISTS "commissionFeePercent" DECIMAL(5,2) NOT NULL DEFAULT 0;
