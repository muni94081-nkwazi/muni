-- CreateEnum
CREATE TYPE "QuestionStatus" AS ENUM ('pending', 'answered', 'closed');

-- CreateEnum
CREATE TYPE "VoteType" AS ENUM ('helpful', 'not_helpful');

-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "user_name" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "status" "QuestionStatus" NOT NULL,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "answers" (
    "id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "seller_store_name" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "helpful_count" INTEGER NOT NULL DEFAULT 0,
    "not_helpful_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_votes" (
    "id" TEXT NOT NULL,
    "answer_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "vote_type" "VoteType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "question_votes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "questions_product_id_created_at_idx" ON "questions"("product_id", "created_at");

-- CreateIndex
CREATE INDEX "questions_status_idx" ON "questions"("status");

-- CreateIndex
CREATE INDEX "answers_question_id_idx" ON "answers"("question_id");

-- CreateIndex
CREATE INDEX "answers_seller_id_idx" ON "answers"("seller_id");

-- CreateIndex
CREATE INDEX "question_votes_answer_id_idx" ON "question_votes"("answer_id");

-- CreateIndex
CREATE UNIQUE INDEX "question_votes_answer_id_user_id_key" ON "question_votes"("answer_id", "user_id");

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_votes" ADD CONSTRAINT "question_votes_answer_id_fkey" FOREIGN KEY ("answer_id") REFERENCES "answers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

