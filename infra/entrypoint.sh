#!/bin/sh
set -e
echo "==> Checking migration status"
# Check if migration table exists and has latest migration
# If error_code column exists in reel_jobs, migrations are done
if PGPASSWORD="$POSTGRES_PASSWORD" psql -h db -U "$DATABASE_USER" -d "$DATABASE_NAME" -c "SELECT 1 FROM information_schema.columns WHERE table_name='reel_jobs' AND column_name='error_code'" 2>/dev/null | grep -q 1; then
  echo "==> Migrations already applied, skipping"
else
  echo "==> Running migrations"
  npx tsx scripts/migrate.ts || (echo "Migration failed; continuing anyway" && exit 0)
fi
echo "==> Seeding (idempotent)"
npx tsx scripts/seed.ts || echo "seed skipped/failed (non-fatal)"
echo "==> Starting Next.js"
# Docker sets HOSTNAME to the container id; Next binds to that, which breaks
# 127.0.0.1 healthchecks. Listen on all interfaces instead.
export HOSTNAME=0.0.0.0
exec node server.js
