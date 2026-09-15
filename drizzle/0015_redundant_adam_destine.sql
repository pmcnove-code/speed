CREATE TABLE "app_settings" (
	"key" varchar(64) PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_base" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(160) NOT NULL,
	"body" text NOT NULL,
	"digest" text DEFAULT '' NOT NULL,
	"source_url" varchar(500),
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "persona_knowledge" (
	"id" serial PRIMARY KEY NOT NULL,
	"persona_id" integer NOT NULL,
	"note" text NOT NULL,
	"source_post_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reel_jobs" (
	"queued_at" timestamp DEFAULT now() NOT NULL,
	"id" serial PRIMARY KEY NOT NULL,
	"status" varchar(16) DEFAULT 'queued' NOT NULL,
	"stage" varchar(24) DEFAULT 'script' NOT NULL,
	"stage_detail" text DEFAULT '' NOT NULL,
	"error" text,
	"error_code" varchar(40),
	"partial" boolean DEFAULT false NOT NULL,
	"post_id" integer,
	"hook" text NOT NULL,
	"script" text NOT NULL,
	"on_screen_text" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cta" text DEFAULT '' NOT NULL,
	"video_brief" text DEFAULT '' NOT NULL,
	"storyboard" jsonb,
	"character_gender" varchar(16),
	"reference_persona_id" integer,
	"reference_character" varchar(120),
	"scene_direction" jsonb,
	"video" "bytea",
	"video_mime" varchar(64),
	"duration_ms" integer,
	"model" varchar(80),
	"worker_job_id" varchar(64),
	"input_hash" varchar(64),
	"dispatch_state" varchar(24) DEFAULT 'pending' NOT NULL,
	"dispatch_started_at" timestamp,
	"dispatched_at" timestamp,
	"worker_heartbeat_at" timestamp,
	"lease_owner" varchar(120),
	"lease_expires_at" timestamp,
	"runner_attempts" integer DEFAULT 0 NOT NULL,
	"flow_project_url" varchar(500),
	"clip_checkpoint" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" varchar(64) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"validated" boolean DEFAULT false NOT NULL,
	"validated_at" timestamp,
	"video_label" varchar(160)
);
--> statement-breakpoint
CREATE TABLE "script_clips" (
	"id" serial PRIMARY KEY NOT NULL,
	"batch_id" integer NOT NULL,
	"clip_number" varchar(8) NOT NULL,
	"duration" varchar(4) NOT NULL,
	"text" text NOT NULL,
	"word_count" integer NOT NULL,
	"estimated_time_sec" numeric NOT NULL,
	"fill_ratio" numeric NOT NULL,
	"generation_prompt" text NOT NULL,
	"internal_breaks" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "personas" ALTER COLUMN "name" SET DATA TYPE varchar(160);--> statement-breakpoint
ALTER TABLE "access_codes" ADD COLUMN "code" varchar(160);--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "airtable_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "personas" ADD COLUMN "voice_id" varchar(160);--> statement-breakpoint
ALTER TABLE "personas" ADD COLUMN "photo" "bytea";--> statement-breakpoint
ALTER TABLE "personas" ADD COLUMN "photo_mime" varchar(64);--> statement-breakpoint
ALTER TABLE "personas" ADD COLUMN "photo_updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "align_score" integer;