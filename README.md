# Reel Copy Studio v2

Self-hosted, persona-driven short-form copy engine (Instagram Reels / TikTok) for the
carnivore / animal-based niche. A professional dashboard variation of the original
`ig-copy-engine`, with Venice AI and DeepSeek as swappable model backends.

## What it does

- Access-code login with **admin** and **member** roles (only admins create/edit personas and manage settings).
- Landing generator: **"Generate copy for all existing personas"**, N posts per persona (default 4), pick Venice or DeepSeek, watch a live per-persona pipeline animation (writing → dedup → done) synced to the backend over SSE, then browse results and copy any post.
- Personas, formats, generation history, and an angle bank, all in Postgres.

## Stack

Next.js 16 (App Router) · Tailwind v4 + shadcn/ui · Framer Motion · Drizzle + Postgres 16 ·
Docker Compose behind Caddy. Model calls go through an OpenAI-compatible client
(`src/lib/llm/provider.ts`); the generation logic is a TypeScript port of the proven v1
Python engine (`src/lib/engine/`).

## Local dev

```bash
cp .env.example .env.local      # fill VENICE_API_KEY + access codes
docker compose -f docker-compose.local.yml up -d      # Postgres on :5440
npm install
npm ci --prefix infra/flow-worker    # browser adapter + worker test dependencies
npx tsx scripts/migrate.ts       # or: apply drizzle/*.sql
npx tsx scripts/seed.ts          # personas, formats, angle bank, access codes
npm run dev                      # http://localhost:3000
npm test                         # engine unit tests
```

## Deploy to the VPS (62.83.10.231)

```bash
export VENICE_API_KEY=...        # DEEPSEEK_API_KEY optional
./infra/provision.sh             # one-time: installs Docker, writes .env, prints access codes
./infra/deploy.sh                # rsync + docker compose up --build
# → http://62.83.10.231
```

To enable HTTPS later, point a domain at the box and change `:80` to the domain in
`infra/Caddyfile` — Caddy provisions a certificate automatically.

## Google Flow / Select Omni

Flow is a Google **user** product. GCP service accounts cannot log in. Experimental
talks to a `flow-worker` sidecar that keeps one signed-in Chrome profile per account.
Generation jobs are serialized, and extra requests wait in the worker queue instead
of opening competing Flow sessions.

The worker uses `puppeteer-extra-plugin-stealth` through `playwright-extra` for
login, session probes, and generation. `FLOW_STEALTH=1` is the default; set it to
`0` and recreate the worker to use plain Playwright. This changes the browser's
automation fingerprint, not the server's IP address. Google may still reject a
generation. A Google rejection ends that job; connected accounts remain available
for manual retries.

To verify the browser integration without contacting Google or spending credits:

```bash
docker compose -f infra/docker-compose.yml --env-file .env exec -T flow-worker node browser-smoke.mjs
docker compose -f infra/docker-compose.yml --env-file .env exec -T flow-worker node tile-smoke.mjs
```

The default `FLOW_GENERATION_TRANSPORT=ui` uses the Flow composer. Setting
`FLOW_GENERATION_TRANSPORT=rpc` uses the same signed-in browser session to call
Flow's private frontend RPCs without generation UI clicks. RPC mode requires a
project and character created by the normal setup flow first. It is an undocumented
Google protocol and remains subject to Flow's credits, reCAPTCHA, and unusual-activity
limits; it does not bypass an account restriction.

Multiple Google accounts are stored under `/data/flow-sessions`; jobs auto-rotate
to an account that still has credits.

Worker (docker network only, `x-flow-secret` header):

- `POST /jobs` `{ hook, script, captions }`
- `GET /jobs/:id`
- `GET /jobs/:id/video`
- `GET /accounts` / session upload + disconnect

If no Flow session is connected, Experimental uses the official Gemini Omni API key
(720p) and falls back to Gemini stills.

## Project layout

| Path | Role |
| --- | --- |
| `src/` | Next.js app, API routes, UI, copy engine, reel orchestration |
| `shared/flow/` | Clip/scene contracts shared by the app and Flow worker |
| `infra/` | Production Compose, Caddy, deploy/provision, `flow-worker` |
| `scripts/` | DB migrate/seed, reel runner, Airtable helpers |
| `docs/` | Guides, contracts, design PDFs, verification reports — see [docs/README.md](docs/README.md) |
| `drizzle/` | SQL migrations |

## Documentation

- [docs/README.md](docs/README.md) — index
- [Batch integration](docs/guides/batch-integration.md)
- [Concurrent generation](docs/guides/concurrent-generation.md)
- [Editing API](docs/contracts/editing-api.md)
- [Flow v3.3 contract](docs/contracts/flow-v33-contract.md)

## Enabling DeepSeek

Set `DEEPSEEK_API_KEY` (server env) and redeploy. Until then the DeepSeek option shows as
disabled in the generator; Venice runs everything.
