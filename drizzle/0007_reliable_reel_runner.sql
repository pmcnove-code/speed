ALTER TABLE "reel_jobs" ADD COLUMN IF NOT EXISTS "worker_job_id" varchar(64);
ALTER TABLE "reel_jobs" ADD COLUMN IF NOT EXISTS "input_hash" varchar(64);
ALTER TABLE "reel_jobs" ADD COLUMN IF NOT EXISTS "dispatch_state" varchar(24) DEFAULT 'pending' NOT NULL;
ALTER TABLE "reel_jobs" ADD COLUMN IF NOT EXISTS "dispatch_started_at" timestamp;
ALTER TABLE "reel_jobs" ADD COLUMN IF NOT EXISTS "dispatched_at" timestamp;
ALTER TABLE "reel_jobs" ADD COLUMN IF NOT EXISTS "worker_heartbeat_at" timestamp;
ALTER TABLE "reel_jobs" ADD COLUMN IF NOT EXISTS "lease_owner" varchar(120);
ALTER TABLE "reel_jobs" ADD COLUMN IF NOT EXISTS "lease_expires_at" timestamp;
ALTER TABLE "reel_jobs" ADD COLUMN IF NOT EXISTS "runner_attempts" integer DEFAULT 0 NOT NULL;
ALTER TABLE "reel_jobs" ADD COLUMN IF NOT EXISTS "flow_project_url" varchar(500);
ALTER TABLE "reel_jobs" ADD COLUMN IF NOT EXISTS "clip_checkpoint" jsonb DEFAULT '{}'::jsonb NOT NULL;
ALTER TABLE "reel_jobs" ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now() NOT NULL;

-- Pre-revamp Flow jobs have no worker UUID or dispatch checkpoint. Their paid
-- state cannot be reconstructed safely, so never auto-submit them again.
UPDATE "reel_jobs"
SET
  "status" = 'error',
  "dispatch_state" = 'legacy_unknown',
  "error" = COALESCE("error", 'Legacy Flow job interrupted before durable dispatch tracking; not retried automatically.'),
  "finished_at" = COALESCE("finished_at", now()),
  "updated_at" = now()
WHERE "status" IN ('queued', 'running')
  AND "worker_job_id" IS NULL
  AND "stage_detail" LIKE '%Flow:%';

CREATE INDEX IF NOT EXISTS "reel_jobs_runner_queue_idx"
  ON "reel_jobs" ("status", "lease_expires_at", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "reel_jobs_worker_job_id_idx"
  ON "reel_jobs" ("worker_job_id")
  WHERE "worker_job_id" IS NOT NULL;
