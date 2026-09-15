ALTER TABLE "reel_jobs" ADD COLUMN IF NOT EXISTS "reference_persona_id" integer;
--> statement-breakpoint
ALTER TABLE "reel_jobs" ADD COLUMN IF NOT EXISTS "reference_character" varchar(120);
