#!/usr/bin/env bash
# Deploy Reel Copy Studio v2 to the VPS.
#   ./infra/deploy.sh            # rsync + rebuild + up
# Requires: ssh access to the target and a populated /opt/copy-studio/.env on the server
# (run ./infra/provision.sh once first).
set -euo pipefail

TARGET="${TARGET:-root@62.83.10.231}"
REMOTE_DIR="${REMOTE_DIR:-/opt/copy-studio}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Running release gates"
cd "$ROOT"
npm run test:all
npm run build
docker compose -f infra/docker-compose.yml config --no-interpolate >/dev/null

echo "==> Syncing source to ${TARGET}:${REMOTE_DIR}"
rsync -az --delete \
  --exclude node_modules --exclude .next --exclude .git \
  --exclude '.env*' --exclude drizzle/meta/_journal.lock \
  --exclude 'infra/flow-worker/data' --exclude '**/flow-sessions' \
  "$ROOT/" "${TARGET}:${REMOTE_DIR}/"

echo "==> Ensuring Flow worker secret exists (not printed)"
ssh "$TARGET" "cd ${REMOTE_DIR} && if [ -f .env ] && ! grep -q '^FLOW_WORKER_SECRET=' .env; then printf '\\nFLOW_WORKER_SECRET=%s\\n' \"\$(openssl rand -hex 32)\" >> .env; fi"

echo "==> Building & starting containers"
ssh "$TARGET" "cd ${REMOTE_DIR} && docker compose -f infra/docker-compose.yml --env-file .env up -d --build --remove-orphans"

echo "==> Waiting for app, worker, and runner health"
ssh "$TARGET" "cd ${REMOTE_DIR} && \
  for attempt in \$(seq 1 40); do \
    if docker compose -f infra/docker-compose.yml exec -T app node -e \
      \"fetch('http://127.0.0.1:3000/api/health').then(r=>r.json()).then(x=>process.exit(x.ok&&x.runner?0:1)).catch(()=>process.exit(1))\" \
      && docker compose -f infra/docker-compose.yml exec -T flow-worker node -e \
      \"fetch('http://127.0.0.1:8787/health').then(r=>r.json()).then(x=>process.exit(x.ok&&x.ready?0:1)).catch(()=>process.exit(1))\"; then \
      exit 0; \
    fi; \
    sleep 3; \
  done; \
  docker compose -f infra/docker-compose.yml ps; \
  exit 1"
ssh "$TARGET" "cd ${REMOTE_DIR} && docker compose -f infra/docker-compose.yml ps"
echo "==> Done. http://62.83.10.231"
