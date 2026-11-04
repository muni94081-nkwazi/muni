-- Withdrawal approval flow.
--
-- A seller's request now waits in `pending` for an admin decision instead of
-- disbursing inline, so the enum needs a terminal state for "an admin declined
-- this" that is distinguishable from "the provider refused the transfer".

-- AlterEnum
ALTER TYPE "PayoutStatus" ADD VALUE 'rejected';

-- AlterTable
ALTER TABLE "vendor_payouts" ADD COLUMN     "reviewed_by" TEXT,
ADD COLUMN     "reviewed_at" TIMESTAMP(3),
ADD COLUMN     "rejection_reason" TEXT;

-- CreateIndex
CREATE INDEX "vendor_payouts_status_created_at_idx" ON "vendor_payouts"("status", "created_at");
