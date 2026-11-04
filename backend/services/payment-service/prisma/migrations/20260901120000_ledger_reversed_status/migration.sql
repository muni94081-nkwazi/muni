-- Refunding an order has to take back what it credited the seller. There was
-- no state for that: a reversed entry could only be left `pending` (still
-- owed) or marked `paid_out` (a lie). Additive — every existing row keeps its
-- current status.

ALTER TYPE "LedgerEntryStatus" ADD VALUE IF NOT EXISTS 'reversed';
