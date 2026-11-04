-- CreateEnum
CREATE TYPE "FulfillmentType" AS ENUM ('SELLER_FULFILLED', 'WAREHOUSE', 'THIRD_PARTY_LOGISTICS');

-- CreateEnum
CREATE TYPE "FulfillmentStatus" AS ENUM ('PENDING', 'ASSIGNED', 'PICKING', 'PACKED', 'HANDED_TO_CARRIER', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED_COD', 'RETURNED', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "FulfillmentPaymentMethod" AS ENUM ('PREPAID', 'COD');

-- CreateEnum
CREATE TYPE "CodVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'SHORT', 'DISPUTED');

-- CreateEnum
CREATE TYPE "LedgerStatus" AS ENUM ('OPEN', 'RECONCILED', 'FLAGGED');

-- CreateEnum
CREATE TYPE "RiderStatus" AS ENUM ('AVAILABLE', 'ON_DELIVERY', 'OFFLINE');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('BODA', 'VAN', 'BICYCLE', 'FOOT');

-- CreateTable
CREATE TABLE "fulfillments" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "sub_order_id" TEXT,
    "seller_id" TEXT NOT NULL,
    "type" "FulfillmentType" NOT NULL,
    "provider" TEXT,
    "warehouse_id" TEXT,
    "warehouse_location" TEXT,
    "status" "FulfillmentStatus" NOT NULL,
    "items" JSONB NOT NULL,
    "shipping_address" JSONB NOT NULL,
    "timeline" JSONB NOT NULL,
    "tracking_number" TEXT,
    "estimated_delivery" TEXT,
    "payment_method" "FulfillmentPaymentMethod" NOT NULL DEFAULT 'PREPAID',
    "cod_amount_due" DECIMAL(14,2),
    "cod_amount_collected" DECIMAL(14,2),
    "cod_currency" TEXT,
    "cod_status" "CodVerificationStatus",
    "rider_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fulfillments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cod_collections" (
    "id" TEXT NOT NULL,
    "fulfillment_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "rider_id" TEXT NOT NULL,
    "amount_due" DECIMAL(14,2) NOT NULL,
    "amount_collected" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "variance" DECIMAL(14,2) NOT NULL,
    "verification_status" "CodVerificationStatus" NOT NULL,
    "notes" TEXT,
    "collected_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cod_collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_ledger_entries" (
    "ledger_key" TEXT NOT NULL,
    "rider_id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "total_due" DECIMAL(14,2) NOT NULL,
    "total_collected" DECIMAL(14,2) NOT NULL,
    "total_remitted" DECIMAL(14,2) NOT NULL,
    "variance" DECIMAL(14,2) NOT NULL,
    "collection_ids" TEXT[],
    "status" "LedgerStatus" NOT NULL,
    "reconciled_at" TIMESTAMP(3),
    "reconciled_by" TEXT,

    CONSTRAINT "cash_ledger_entries_pkey" PRIMARY KEY ("ledger_key")
);

-- CreateTable
CREATE TABLE "riders" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "vehicle_type" "VehicleType" NOT NULL,
    "status" "RiderStatus" NOT NULL,
    "active_fulfillment_ids" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "riders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "digital_signatures" (
    "id" TEXT NOT NULL,
    "fulfillment_id" TEXT NOT NULL,
    "rider_id" TEXT NOT NULL,
    "signature_data" TEXT NOT NULL,
    "recipient_name" TEXT NOT NULL,
    "location" JSONB,
    "captured_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "digital_signatures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fulfillments_order_id_idx" ON "fulfillments"("order_id");

-- CreateIndex
CREATE INDEX "fulfillments_seller_id_created_at_idx" ON "fulfillments"("seller_id", "created_at");

-- CreateIndex
CREATE INDEX "fulfillments_rider_id_status_idx" ON "fulfillments"("rider_id", "status");

-- CreateIndex
CREATE INDEX "cod_collections_rider_id_collected_at_idx" ON "cod_collections"("rider_id", "collected_at");

-- CreateIndex
CREATE INDEX "cod_collections_fulfillment_id_idx" ON "cod_collections"("fulfillment_id");

-- CreateIndex
CREATE INDEX "cash_ledger_entries_rider_id_date_idx" ON "cash_ledger_entries"("rider_id", "date");

-- CreateIndex
CREATE INDEX "cash_ledger_entries_status_idx" ON "cash_ledger_entries"("status");

-- CreateIndex
CREATE INDEX "riders_status_idx" ON "riders"("status");

-- CreateIndex
CREATE INDEX "digital_signatures_fulfillment_id_idx" ON "digital_signatures"("fulfillment_id");

-- CreateIndex
CREATE INDEX "digital_signatures_rider_id_idx" ON "digital_signatures"("rider_id");

-- AddForeignKey
ALTER TABLE "cod_collections" ADD CONSTRAINT "cod_collections_fulfillment_id_fkey" FOREIGN KEY ("fulfillment_id") REFERENCES "fulfillments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digital_signatures" ADD CONSTRAINT "digital_signatures_fulfillment_id_fkey" FOREIGN KEY ("fulfillment_id") REFERENCES "fulfillments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

