-- CreateTable
CREATE TABLE "seller_progress" (
    "seller_id" TEXT NOT NULL,
    "onboarding_percentage" INTEGER NOT NULL,
    "completed_steps" JSONB NOT NULL,
    "completed_course_ids" TEXT[],
    "earned_badges" TEXT[],
    "last_active_at" TEXT NOT NULL,

    CONSTRAINT "seller_progress_pkey" PRIMARY KEY ("seller_id")
);

-- CreateTable
CREATE TABLE "webinars" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "speaker" TEXT NOT NULL,
    "scheduled_at" TEXT NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "registration_url" TEXT NOT NULL,
    "attendees_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "webinars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webinar_registrations" (
    "id" TEXT NOT NULL,
    "webinar_id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "registered_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webinar_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "webinar_registrations_seller_id_idx" ON "webinar_registrations"("seller_id");

-- CreateIndex
CREATE UNIQUE INDEX "webinar_registrations_webinar_id_seller_id_key" ON "webinar_registrations"("webinar_id", "seller_id");

-- AddForeignKey
ALTER TABLE "webinar_registrations" ADD CONSTRAINT "webinar_registrations_webinar_id_fkey" FOREIGN KEY ("webinar_id") REFERENCES "webinars"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ── Webinar catalogue ────────────────────────────────────────────────────────
-- Seeded so a fresh database offers the same webinar the hardcoded array did.
-- Unlike the demo data removed from other services this is real editorial
-- content, not a fabricated transaction, so it belongs in the catalogue.
INSERT INTO "webinars" ("id", "title", "speaker", "scheduled_at", "duration_minutes", "registration_url", "attendees_count")
VALUES (
  'webinar-1',
  'East Africa E-Commerce Growth Summit 2026',
  'Grace Atuhaire, Head of Seller Success at MUNI',
  '2026-08-30T00:00:00.000Z',
  60,
  'https://muni.ug/webinars/summit-2026',
  342
)
ON CONFLICT ("id") DO NOTHING;
