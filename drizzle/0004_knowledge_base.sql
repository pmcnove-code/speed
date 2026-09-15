CREATE TABLE IF NOT EXISTS "knowledge_base" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(160) NOT NULL,
	"body" text NOT NULL,
	"digest" text DEFAULT '' NOT NULL,
	"source_url" varchar(500),
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
