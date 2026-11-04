-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'processing', 'completed', 'failed', 'refunded');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('mtn_momo', 'airtel', 'card', 'visa_card', 'pesapal', 'flutterwave', 'cod');

-- CreateEnum
CREATE TYPE "EscrowStatus" AS ENUM ('in_escrow', 'dispute_hold', 'released_to_vendor', 'refunded_to_buyer');

-- CreateEnum
CREATE TYPE "LedgerEntryStatus" AS ENUM ('pending', 'available', 'paid_out');

-- CreateEnum
CREATE TYPE "PayoutMethod" AS ENUM ('mobile_money', 'bank_transfer');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "PayoutRequestedBy" AS ENUM ('seller', 'system_scheduled');

-- CreateTable
CREATE TABLE "payment_transactions" (
    "payment_id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "phone_number" TEXT,
    "checkout_url" TEXT,
    "idempotency_key" TEXT,
    "raw_payload" JSONB,
    "paid_at" TIMESTAMP(3),
    "provider" TEXT,
    "provider_reference_id" TEXT,
    "provider_transaction_id" TEXT,
    "provider_status" TEXT,
    "failure_reason" TEXT,
    "amount_ugx" DECIMAL(18,4),
    "exchange_rate" DECIMAL(18,8),
    "poll_attempts" INTEGER NOT NULL DEFAULT 0,
    "card" JSONB,
    "three_d_secure_redirect_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("payment_id")
);

-- CreateTable
CREATE TABLE "processed_webhooks" (
    "event_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_webhooks_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "escrow_holds" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "sub_order_id" TEXT,
    "vendor_id" TEXT NOT NULL,
    "buyer_id" TEXT NOT NULL,
    "amount_ugx" DECIMAL(18,4) NOT NULL,
    "status" "EscrowStatus" NOT NULL DEFAULT 'in_escrow',
    "auto_release_date" TIMESTAMP(3) NOT NULL,
    "hold_reason" TEXT,
    "released_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "escrow_holds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_balances" (
    "vendor_id" TEXT NOT NULL,
    "available_balance" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "pending_balance" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'UGX',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_balances_pkey" PRIMARY KEY ("vendor_id")
);

-- CreateTable
CREATE TABLE "vendor_ledger_entries" (
    "id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "sub_order_id" TEXT,
    "vendor_id" TEXT NOT NULL,
    "gross_amount" DECIMAL(18,4) NOT NULL,
    "platform_fee" DECIMAL(18,4) NOT NULL,
    "net_vendor_amount" DECIMAL(18,4) NOT NULL,
    "status" "LedgerEntryStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_commission_entries" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "sub_order_id" TEXT,
    "vendor_id" TEXT NOT NULL,
    "gross_amount" DECIMAL(18,4) NOT NULL,
    "commission_rate" DECIMAL(6,4) NOT NULL,
    "commission_amount" DECIMAL(18,4) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_commission_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_payouts" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'UGX',
    "method" "PayoutMethod" NOT NULL,
    "destination_account" JSONB NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'pending',
    "reference" TEXT NOT NULL,
    "requested_by" "PayoutRequestedBy" NOT NULL DEFAULT 'seller',
    "processed_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_reference_key" ON "payment_transactions"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_idempotency_key_key" ON "payment_transactions"("idempotency_key");

-- CreateIndex
CREATE INDEX "payment_transactions_order_id_idx" ON "payment_transactions"("order_id");

-- CreateIndex
CREATE INDEX "payment_transactions_status_provider_status_idx" ON "payment_transactions"("status", "provider_status");

-- CreateIndex
CREATE UNIQUE INDEX "escrow_holds_order_id_key" ON "escrow_holds"("order_id");

-- CreateIndex
CREATE INDEX "escrow_holds_vendor_id_idx" ON "escrow_holds"("vendor_id");

-- CreateIndex
CREATE INDEX "escrow_holds_status_idx" ON "escrow_holds"("status");

-- CreateIndex
CREATE INDEX "vendor_ledger_entries_vendor_id_status_idx" ON "vendor_ledger_entries"("vendor_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_ledger_entries_sub_order_id_vendor_id_key" ON "vendor_ledger_entries"("sub_order_id", "vendor_id");

-- CreateIndex
CREATE INDEX "platform_commission_entries_vendor_id_idx" ON "platform_commission_entries"("vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_payouts_reference_key" ON "vendor_payouts"("reference");

-- CreateIndex
CREATE INDEX "vendor_payouts_vendor_id_status_idx" ON "vendor_payouts"("vendor_id", "status");

