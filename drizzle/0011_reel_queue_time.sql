ALTER TABLE "reel_jobs" ADD COLUMN IF NOT EXISTS "queued_at" timestamp;
UPDATE "reel_jobs" SET "queued_at" = "created_at" WHERE "queued_at" IS NULL;
ALTER TABLE "reel_jobs" ALTER COLUMN "queued_at" SET DEFAULT now();
ALTER TABLE "reel_jobs" ALTER COLUMN "queued_at" SET NOT NULL;
