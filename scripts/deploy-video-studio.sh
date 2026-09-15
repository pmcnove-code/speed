#!/bin/bash
# Run from the server checkout after building and testing app + flow-worker.
set -euo pipefail
compose=(docker compose -f infra/docker-compose.yml --env-file .env)
active_jobs() { docker exec infra-db-1 psql -U copy -d copystudio -At -c "select count(*) from reel_jobs where status in ('queued','running')"; }
[ "$(active_jobs)" = 0 ] || { echo 'Active generation; deployment deferred'; exit 2; }
docker exec infra-flow-worker-1 node --input-type=module -e 'import{readdir,readFile}from"node:fs/promises";const dir="/data/flow-sessions/edits";for(const f of await readdir(dir).catch(()=>[])){if(!f.endsWith(".json"))continue;const e=JSON.parse(await readFile(`${dir}/${f}`,"utf8"));if(["queued","running"].includes(e.status))throw Error("Active edit; deployment deferred");}'
"${compose[@]}" stop reel-runner
trap '"${compose[@]}" up -d --no-deps reel-runner' EXIT
[ "$(active_jobs)" = 0 ] || { echo 'A job arrived; deployment deferred'; exit 2; }
"${compose[@]}" up -d --no-deps flow-worker app
# start would reuse the old container/image; up recreates it with the new app build.
"${compose[@]}" up -d --no-deps reel-runner
app_image=$(docker inspect --format '{{.Image}}' infra-app-1)
runner_image=$(docker inspect --format '{{.Image}}' infra-reel-runner-1)
[ "$app_image" = "$runner_image" ] || { echo 'App/runner image mismatch'; exit 1; }
trap - EXIT
echo 'App and runner use the same image'
