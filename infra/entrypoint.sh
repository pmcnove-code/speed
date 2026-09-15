#!/bin/sh
set -e
echo "==> Running migrations"
npx tsx scripts/migrate.ts
echo "==> Seeding (idempotent)"
npx tsx scripts/seed.ts || echo "seed skipped/failed (non-fatal)"
echo "==> Starting Next.js"
# Docker sets HOSTNAME to the container id; Next binds to that, which breaks
# 127.0.0.1 healthchecks. Listen on all interfaces instead.
export HOSTNAME=0.0.0.0
exec node server.js
