ALTER TABLE "personas" ADD COLUMN IF NOT EXISTS "voice_id" varchar(160);
ALTER TABLE "batches" ADD COLUMN IF NOT EXISTS "airtable_sent_at" timestamp;
ALTER TABLE "reel_jobs" ADD COLUMN IF NOT EXISTS "validated" boolean NOT NULL DEFAULT false;
ALTER TABLE "reel_jobs" ADD COLUMN IF NOT EXISTS "validated_at" timestamp;
ALTER TABLE "reel_jobs" ADD COLUMN IF NOT EXISTS "video_label" varchar(160);
