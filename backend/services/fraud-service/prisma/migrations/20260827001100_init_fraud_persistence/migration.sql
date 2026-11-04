-- CreateEnum
CREATE TYPE "FraudDecision" AS ENUM ('ALLOW', 'REVIEW', 'BLOCK');

-- CreateTable
CREATE TABLE "fraud_cases" (
    "order_id" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "decision" "FraudDecision" NOT NULL,
    "triggered_rules" TEXT[],
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fraud_cases_pkey" PRIMARY KEY ("order_id")
);

-- CreateIndex
CREATE INDEX "fraud_cases_decision_created_at_idx" ON "fraud_cases"("decision", "created_at");

