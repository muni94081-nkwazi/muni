-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'AWAITING_CUSTOMER', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "RequesterRole" AS ENUM ('CUSTOMER', 'SELLER');

-- CreateEnum
CREATE TYPE "TicketCategory" AS ENUM ('ORDER_ISSUE', 'DELIVERY_ISSUE', 'PAYMENT_ISSUE', 'REFUND_REQUEST', 'ACCOUNT_ACCESS', 'PRODUCT_LISTING', 'PAYOUT_ISSUE', 'TECHNICAL_PROBLEM', 'POLICY_QUESTION', 'OTHER');

-- CreateTable
CREATE TABLE "tickets" (
    "id" TEXT NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "requesterRole" "RequesterRole" NOT NULL DEFAULT 'CUSTOMER',
    "requesterName" TEXT,
    "subject" TEXT NOT NULL,
    "category" "TicketCategory" NOT NULL DEFAULT 'OTHER',
    "priority" "TicketPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "orderId" TEXT,
    "subOrderId" TEXT,
    "productId" TEXT,
    "sellerId" TEXT,
    "assigneeId" TEXT,
    "assigneeName" TEXT,
    "firstResponseDueAt" TIMESTAMP(3),
    "firstResponseAt" TIMESTAMP(3),
    "resolutionDueAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "slaBreached" BOOLEAN NOT NULL DEFAULT false,
    "satisfactionRating" INTEGER,
    "satisfactionComment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_messages" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT,
    "authorRole" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "attachments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_events" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actorId" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_counters" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "value" INTEGER NOT NULL DEFAULT 1000,

    CONSTRAINT "ticket_counters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tickets_ticketNumber_key" ON "tickets"("ticketNumber");

-- CreateIndex
CREATE INDEX "tickets_requesterId_status_createdAt_idx" ON "tickets"("requesterId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "tickets_status_priority_createdAt_idx" ON "tickets"("status", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "tickets_assigneeId_status_idx" ON "tickets"("assigneeId", "status");

-- CreateIndex
CREATE INDEX "tickets_orderId_idx" ON "tickets"("orderId");

-- CreateIndex
CREATE INDEX "ticket_messages_ticketId_createdAt_idx" ON "ticket_messages"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "ticket_events_ticketId_createdAt_idx" ON "ticket_events"("ticketId", "createdAt");

-- AddForeignKey
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
