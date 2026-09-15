CREATE TABLE "access_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"code_hash" text NOT NULL,
	"label" varchar(64) NOT NULL,
	"role" varchar(16) DEFAULT 'member' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "access_codes_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
CREATE TABLE "angle_bank" (
	"id" serial PRIMARY KEY NOT NULL,
	"theme" varchar(64) NOT NULL,
	"angle" text NOT NULL,
	"fits" varchar(120) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" varchar(24) NOT NULL,
	"model" varchar(80) NOT NULL,
	"count_requested" integer NOT NULL,
	"persona_ids" jsonb NOT NULL,
	"format_id" integer NOT NULL,
	"situation" text,
	"status" varchar(16) DEFAULT 'queued' NOT NULL,
	"error" text,
	"usage" jsonb,
	"created_by" varchar(64) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "formats" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"structure" text NOT NULL,
	"length" text NOT NULL,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"batch_id" integer NOT NULL,
	"stage" varchar(40) NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ts" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personas" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"handle" varchar(64) NOT NULL,
	"audience" text NOT NULL,
	"tone" text NOT NULL,
	"backstory" text NOT NULL,
	"angle" text NOT NULL,
	"problem" text NOT NULL,
	"intensity" varchar(16) DEFAULT 'bold' NOT NULL,
	"instructions" text,
	"emoji" varchar(8) DEFAULT '🥩' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "personas_handle_unique" UNIQUE("handle")
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"batch_id" integer NOT NULL,
	"persona_id" integer NOT NULL,
	"hook" text NOT NULL,
	"script" text NOT NULL,
	"on_screen_text" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cta" text DEFAULT '' NOT NULL,
	"video_brief" text DEFAULT '' NOT NULL,
	"disclaimer" text DEFAULT '' NOT NULL,
	"angle_tag" varchar(80) DEFAULT '' NOT NULL,
	"guard_kept" boolean DEFAULT true NOT NULL,
	"guard_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
