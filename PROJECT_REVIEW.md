# Copy Studio v2 — project review

Reviewed September 10, 2026. This is a local code and available-history review, not a production certification or a complete transcript archive.

## Evidence and memory coverage

- Read the project instructions, README, source structure, core copy pipeline, database schema and migrations, authentication and selected API routes, video orchestration, worker persistence/recovery, deployment configuration, tests, and saved browser evidence.
- Git has one commit: `d7c0a2d`, the September 3 Create Next App scaffold. Almost all application implementation is modified or untracked. Git cannot supply the intervening implementation history.
- The local Codex memories directory is empty. Searches of available local session records located an older Claude conversation that explicitly describes this project's initial build and deployment. The available records are not a complete history of subsequent work.
- The historical recap reports an initial deployment on September 3 to `161.97.122.60`, including a successful generation smoke test. That is a historical assertion, not a verification performed in this review.
- The current README and deployment script target `62.83.10.231`, under `/opt/copy-studio`. The exact migration timeline and present live server state were not established.
- A separate source pack exists at `/Users/john/projects/copy-studio-v2-research/knowledge-pack.md`. It covers creator formats, audience language, FAQs, a claims map, disclaimers, 60 angles, and sources. Its editorial instructions describe an earlier approach and should not be assumed to match current runtime behavior.
- Saved browser dumps and screenshots document Flow troubleshooting around September 9–10. `.tmp-flow-proof/last-error-ui.txt` includes an unusual-activity rejection and Google's statement that the failed generation was not charged. It also shows a library of existing video tiles. Tiles alone do not verify successful final reel assembly.
- Secrets and historical access-code values are intentionally omitted from this review.

## Product and architecture

Reel Copy Studio is a self-hosted, shared-team application for producing persona-driven carnivore/animal-based short-form scripts and experimental vertical videos.

The package declares Next.js 16.3.4, React 19.2.8, TypeScript, Tailwind v4, Radix/shadcn components, Framer Motion, Drizzle, and Postgres. The main production services are Postgres, the Next.js app, a separate reel runner, a Flow browser worker, and Caddy.

The reviewed source areas contain approximately 27,491 lines of TypeScript, JavaScript modules, SQL, and shell, including tests. This is substantial implementation beyond a starter scaffold.

| Area | Implemented behavior | Main entry points |
| --- | --- | --- |
| Login and roles | Access-code login, signed 30-day session, admin/member distinction | `src/lib/session.ts`, `src/lib/session-edge.ts`, `src/app/api/auth/` |
| Copy generation | Select active personas/provider/count; stream stored progress events; display structured results | `src/components/generate/`, `src/app/api/generate/`, `src/lib/engine/` |
| Personas | Manage detailed briefs, active state and photos; ten seeded personas | `src/components/personas/`, `scripts/personas.seed.ts` |
| Refinement and learning | Rewrite a saved post and save the owner's instruction as persona knowledge | `src/app/api/posts/[id]/refine/route.ts` |
| Knowledge base | Store source material, compact long material into digests, import YouTube material | `src/components/knowledge/`, `src/lib/engine/knowledge.ts`, `src/lib/transcribe.ts` |
| Airtable | Export posts and synchronize destination schema | `src/lib/airtable.ts`, `src/lib/airtable-schema.ts` |
| History | Inspect copy batches and experimental reel jobs | `src/components/history/` |
| Costs | Estimate batch token spend and aggregate reports | `src/lib/cost.ts`, `src/lib/cost-report.ts` |
| Settings | Configure providers, credentials, generation parameters, access codes and Flow accounts | `src/lib/config.ts`, `src/components/settings/` |
| Experimental reels | Queue source copy, plan clips, generate/download/validate video and assemble MP4 | `src/lib/experimental/`, `scripts/reel-runner.ts`, `infra/flow-worker/` |

## Copy engine

The text backends are Venice, DeepSeek and Grok. Configuration resolves through database settings and environment/default values. Their present external availability was not probed.

Each persona is processed through chunked parallel generation, deduplication against recent history and the current batch, and persona-alignment scoring. The alignment threshold is 80. The engine overgenerates by three posts and allows up to four rounds to replenish rejected material. Similar-copy rejection is configurable.

Posts contain a hook, script, on-screen lines, CTA, video brief and angle tag. Prompts emphasize distinct ideas and phrasing, strong hooks, persona voice and short spoken beats. Owner-source digests and recent persona refinement instructions enter the prompts.

The ten seed handles are `elder-emeka`, `marcus-meat-first`, `farm-mabel`, `colette-de-paris`, `papa-diego`, `road-hank`, `rosa-gut-calm`, `coach-andre`, `diane-midlife-reset`, and `mei-quiet-glow`. Database-edited personas may differ from these seeds.

Important differences from the historical recap: the current pipeline does not invoke the earlier compliance guard, and the current generated-post shape omits a disclaimer field. Legacy guard/disclaimer columns remain in the database. The scorer measures persona alignment; it is not that earlier guard. The older recap's claim that the guard is active cannot describe the current source accurately.

## Video system and latest reliability work

The reel API inserts a database job. The separate runner claims jobs with leases and a singleton advisory lock, records heartbeat information, and calls the reel engine. This separates long video work from the HTTP request lifetime.

When Flow is available, the app resolves persona/character/voice information and uses shared v3.3 splitting logic. Clips preserve source text, account for syllables and pauses, use 4/6/8/10-second duration tiers, avoid duplicated hooks, and validate reconstruction of the spoken source. The shared implementation lives in `shared/flow/clip-v33.mjs`.

The worker maintains signed-in browser profiles, account selection/rotation, serialized generation, and browser login controls. The default transport drives the Flow UI; an optional transport calls private frontend RPCs using the signed-in session. This is an external integration with account/session dependencies.

Recent reliability mechanisms include:

- Stable input hashes and idempotency keys connecting app reels to worker jobs.
- Persisted worker IDs and resuming saved jobs rather than automatically submitting again.
- Atomic per-job state files, checkpoint persistence and restart recovery.
- Explicit clip phases: preflight, dispatching, rendering, rendered, acquiring, validating and verified.
- Conservative handling of crashes at the paid-submission boundary.
- Bounded download/acquisition retries after dispatch, with a separate bounded content retry for a confirmed speech mismatch on the current asset.
- Asset identity checks, duration checks, speech matching and transcript caching keyed to MP4 identity.
- Account restriction detection and structured job logs.

The alternative path uses the configured Gemini video integration, with still-image/typography and optional speech assembly under supported fallback conditions. FFmpeg stitches the final vertical MP4. Final app videos are stored as binary data in Postgres; worker state/media also live in its persistent data volume. No external model call was made during this review.

## Database and deployment

Eight SQL migrations cover the initial schema, persona photos, knowledge/alignment, app settings, global knowledge, plaintext access-code storage, reel jobs, and reliable runner state.

The current schema includes access codes, personas, formats, batches, posts, job events, app settings, persona knowledge, global knowledge, angles and reel jobs. Reel records carry dispatch state, worker identity, leases, heartbeat, checkpoints and final video metadata/content.

The application image includes FFmpeg, yt-dlp and runtime migration/seed tooling. Its entrypoint migrates, attempts idempotent seeding, and starts the standalone Next.js server. Production Compose includes persistent database and Flow volumes. Caddy currently exposes port 80.

`infra/deploy.sh` runs tests, typechecking, a build, and Compose validation before syncing and rebuilding the remote services. It then verifies app, worker and runner health. Lint is not currently included in those release gates. No deployment was performed here.

## Findings and unfinished work

1. **The implementation has no committed development history.** The initial scaffold is the only commit and most feature directories are untracked. Preserve and review the implementation before creating a meaningful baseline; keep credentials/browser sessions out of it. Git's tracked diff alone substantially understates this project.
2. **Lint currently fails.** There are five errors and seven warnings. Errors occur in `knowledge-sheet.tsx` (state update in effect), `persona-sheet.tsx` (state update in effect and unescaped apostrophe), `flow-accounts.tsx` (ref assignment during render), and `airtable-schema.ts` (`prefer-const`).
3. **Live Flow success remains unverified.** Local tests establish deterministic recovery behavior. Saved evidence still includes a Google unusual-activity rejection. A complete current reel needs verification across submission, correct clip acquisition, speech verification, stitching and playback before claiming production success.
4. **Copy batches still run in the web process.** `POST /api/generate` starts `void runBatch(...)`; unlike reels, copy batches have no equivalent durable runner in the reviewed path. A process restart can interrupt the job.
5. **Generation failures can appear as completed batches.** Chunk failures are swallowed by `generateParallel`; after bounded top-ups, `runBatch` can mark a batch done with fewer posts than requested, including zero if every chunk fails. Partial completion is not represented as its own batch status.
6. **Alignment has an explicit fail-open path.** A scorer error assigns the passing threshold. Refined posts are scored and saved without enforcing that threshold, and refinement bypasses the normal batch deduplication path.
7. **The uniqueness switch is shared state.** Any authenticated user can update the global `GEN_UNIQUE_DROP` setting through the generation API. Jobs read the setting when they run rather than snapshotting it in the batch. Confirm that this shared behavior matches team expectations.
8. **Access-code changes do not revoke issued sessions.** Session verification trusts signed label/role claims for up to 30 days without checking whether the code remains present or has been demoted. The secret has a development fallback, the cookie does not set `secure`, and login has no visible rate limiter. These are concrete implementation properties; their production exposure was not assessed.
9. **Cost reports are estimates with incomplete scope.** They aggregate batch token usage using configured code rates. Refinement usage is discarded in its route, and this reporting path does not account for all knowledge distillation, transcription or video-generation work. It should not be treated as a complete provider bill.
10. **Local setup documentation is incomplete.** README sets up a database on port 5440, while the script fallback uses 5432. The standalone scripts import `dotenv/config`, which defaults to `.env`, whereas README tells users to create `.env.local`. The documented local commands also omit starting the new reel runner.
11. **Health reporting distinguishes app health from runner health.** `/api/health` may return HTTP 200 with `runner: false`, because its `ok` flag requires the database and configured worker, not the runner. Deployment explicitly checks runner freshness, but the app container healthcheck only checks HTTP success.
12. **Documentation and debug-file hygiene lag implementation.** README omits several current features and settings capabilities. Debug screenshots and browser dumps remain untracked in the root, are not generally ignored, and are not excluded by the deployment sync.

## Verification performed

| Check | Result |
| --- | --- |
| Application Vitest suite | 118 tests passed across 16 files |
| Worker suite in sandbox | 152 passed; one HTTP durability test blocked by `listen EPERM` |
| HTTP durability test outside sandbox | Passed; verifies deduplicated submission and retained worker ID after restart |
| TypeScript | `npm run typecheck` passed |
| ESLint | Failed: five errors, seven warnings |
| Production build | Not run in this review |
| Database migrations/live data | Not applied or queried in this review |
| Browser walkthrough/live paid generation/VPS | Not performed in this review |

Across the worker suite and targeted permitted rerun, all 153 worker tests passed. The combined `npm run test:all` invocation itself stopped at the sandbox-blocked worker test; typechecking was run separately. No application implementation was changed. This report is the only intentionally added project file.

## Suggested next sequence

First preserve the implementation in a reviewed Git baseline and resolve the existing lint errors. Bring setup and operating documentation into agreement with the separate runner. Then verify the current deployed migration, worker/runner health and a complete reel with explicit generation authorization. Address durable copy execution, accurate partial/error statuses, session revocation and the incomplete cost ledger according to product priorities.
