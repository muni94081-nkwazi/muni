-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'REFUNDED', 'CANCELLED');

-- CreateTable
CREATE TABLE "return_requests" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "description" TEXT,
    "refund_method" TEXT NOT NULL,
    "refund_amount" DECIMAL(14,2),
    "currency" TEXT,
    "status" "ReturnStatus" NOT NULL,
    "is_auto_approved" BOOLEAN NOT NULL DEFAULT false,
    "guarantee_badge" TEXT NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL,
    "approved_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "return_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_items" (
    "id" TEXT NOT NULL,
    "return_id" TEXT NOT NULL,
    "order_item_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,

    CONSTRAINT "return_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "return_requests_user_id_requested_at_idx" ON "return_requests"("user_id", "requested_at");

-- CreateIndex
CREATE INDEX "return_requests_seller_id_requested_at_idx" ON "return_requests"("seller_id", "requested_at");

-- CreateIndex
CREATE INDEX "return_requests_status_idx" ON "return_requests"("status");

-- CreateIndex
CREATE INDEX "return_requests_order_id_idx" ON "return_requests"("order_id");

-- CreateIndex
CREATE INDEX "return_items_return_id_idx" ON "return_items"("return_id");

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "return_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

