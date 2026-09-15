ALTER TABLE "personas" ALTER COLUMN "name" SET DATA TYPE varchar(160);
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "align_score" integer;
CREATE TABLE IF NOT EXISTS "persona_knowledge" (
	"id" serial PRIMARY KEY NOT NULL,
	"persona_id" integer NOT NULL,
	"note" text NOT NULL,
	"source_post_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
