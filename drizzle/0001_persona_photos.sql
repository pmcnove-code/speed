ALTER TABLE "personas" ADD COLUMN IF NOT EXISTS "photo" bytea;
ALTER TABLE "personas" ADD COLUMN IF NOT EXISTS "photo_mime" varchar(64);
ALTER TABLE "personas" ADD COLUMN IF NOT EXISTS "photo_updated_at" timestamp;
