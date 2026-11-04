-- Where a hand-made bank transfer is recorded.
--
-- MUNI has no bank-transfer driver: nothing in payment-service moves money to a
-- bank account. Approving such a payout used to mark it `completed`, which said
-- the seller had been paid when all that had happened was an admin clicking
-- approve. It now stays `processing` until a human confirms the real transfer
-- and quotes the bank's own reference, which lands here.
--
-- Nullable because mobile-money payouts never have one — those are settled by a
-- provider response, and `reference` already carries our own id.
ALTER TABLE "vendor_payouts"
  ADD COLUMN IF NOT EXISTS "settlement_reference" TEXT;
