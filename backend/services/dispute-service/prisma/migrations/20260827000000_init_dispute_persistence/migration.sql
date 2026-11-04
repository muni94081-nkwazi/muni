-- CreateEnum
CREATE TYPE "ClaimType" AS ENUM ('NON_DELIVERY', 'DEFECTIVE_ITEM');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPENED', 'SELLER_RESPONDED', 'UNDER_MEDIATION', 'ARBITRATION', 'RESOLVED_BUYER_FAVOR', 'RESOLVED_SELLER_FAVOR', 'CLOSED');

-- CreateEnum
CREATE TYPE "ResolutionAction" AS ENUM ('ACCEPT_RETURN', 'REFUND_FULL', 'REFUND_PARTIAL');

-- CreateEnum
CREATE TYPE "SlaStatus" AS ENUM ('PENDING', 'BREACHED', 'MET');

-- CreateEnum
CREATE TYPE "DisputeSenderRole" AS ENUM ('buyer', 'seller', 'admin');

-- CreateTable
CREATE TABLE "disputes" (
    "id" TEXT NOT NULL,
    "dispute_number" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "sub_order_id" TEXT,
    "buyer_id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "claim_type" "ClaimType" NOT NULL,
    "description" TEXT NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "claim_amount_ugx" DECIMAL(14,2) NOT NULL,
    "status" "DisputeStatus" NOT NULL,
    "resolution_action" "ResolutionAction",
    "refund_amount_ugx" DECIMAL(14,2),
    "resolution_note" TEXT,
    "resolution_deadline" TIMESTAMP(3) NOT NULL,
    "sla_status" "SlaStatus" NOT NULL DEFAULT 'PENDING',
    "auto_escalated" BOOLEAN NOT NULL DEFAULT false,
    "admin_id" TEXT,
    "escalated_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispute_messages" (
    "id" TEXT NOT NULL,
    "dispute_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "sender_role" "DisputeSenderRole" NOT NULL,
    "content" TEXT NOT NULL,
    "attachments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sent_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dispute_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "disputes_dispute_number_key" ON "disputes"("dispute_number");

-- CreateIndex
CREATE INDEX "disputes_buyer_id_idx" ON "disputes"("buyer_id");

-- CreateIndex
CREATE INDEX "disputes_seller_id_idx" ON "disputes"("seller_id");

-- CreateIndex
CREATE INDEX "disputes_order_id_idx" ON "disputes"("order_id");

-- CreateIndex
CREATE INDEX "disputes_status_resolution_deadline_idx" ON "disputes"("status", "resolution_deadline");

-- CreateIndex
CREATE INDEX "dispute_messages_dispute_id_sent_at_idx" ON "dispute_messages"("dispute_id", "sent_at");

-- AddForeignKey
ALTER TABLE "dispute_messages" ADD CONSTRAINT "dispute_messages_dispute_id_fkey" FOREIGN KEY ("dispute_id") REFERENCES "disputes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

