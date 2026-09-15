#!/usr/bin/env bash
# One-time VPS provisioning: Docker Engine + compose plugin, firewall, and the .env file.
# Run locally; it SSHes to the target. Generates secrets and prints the access codes ONCE.
set -euo pipefail

TARGET="${TARGET:-root@62.83.10.231}"
REMOTE_DIR="${REMOTE_DIR:-/opt/copy-studio}"
VENICE_API_KEY="${VENICE_API_KEY:?set VENICE_API_KEY in your shell before running}"
DEEPSEEK_API_KEY="${DEEPSEEK_API_KEY:-}"

echo "==> Installing Docker on ${TARGET} (idempotent)"
ssh "$TARGET" 'bash -s' <<'REMOTE'
set -e
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null 2>&1 || apt-get install -y docker-compose-plugin
# firewall: allow ssh + http only (ufw is a no-op if inactive/not installed)
if command -v ufw >/dev/null 2>&1; then
  ufw allow 22/tcp || true
  ufw allow 80/tcp || true
fi
mkdir -p /opt/copy-studio
REMOTE

# secrets generated locally so we can print the codes to the operator
PG_PW="$(openssl rand -hex 16)"
SESSION_SECRET="$(openssl rand -hex 32)"
ADMIN_CODE="carni-admin-$(openssl rand -hex 3)"
MEMBER_CODE="carni-team-$(openssl rand -hex 3)"

echo "==> Writing ${REMOTE_DIR}/.env on the server"
ssh "$TARGET" "cat > ${REMOTE_DIR}/.env" <<ENV
POSTGRES_PASSWORD=${PG_PW}
SESSION_SECRET=${SESSION_SECRET}
VENICE_API_KEY=${VENICE_API_KEY}
DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY}
GROK_API_KEY=${GROK_API_KEY:-}
AIRTABLE_TOKEN=${AIRTABLE_TOKEN:-}
AIRTABLE_BASE_ID=${AIRTABLE_BASE_ID:-}
AIRTABLE_TABLE=${AIRTABLE_TABLE:-Posts}
ADMIN_ACCESS_CODE=${ADMIN_CODE}
MEMBER_ACCESS_CODE=${MEMBER_CODE}
FLOW_WORKER_SECRET=$(openssl rand -hex 32)
ENV

echo ""
echo "======================================================"
echo " SAVE THESE — shown only once:"
echo "   Admin access code : ${ADMIN_CODE}"
echo "   Member access code: ${MEMBER_CODE}"
echo "======================================================"
echo "Now run: ./infra/deploy.sh"
