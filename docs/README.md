# Documentation

Internal docs for **Reel Copy Studio** (package `copy-studio-v2`): persona-driven short-form copy and experimental vertical video for the carnivore / animal-based niche.

## Layout

| Path | Contents |
| --- | --- |
| [`contracts/`](./contracts/) | Editing API, automatic clip editing, Flow v3.3 clip-split contract |
| [`guides/`](./guides/) | Batch production integration, concurrent multi-account generation |
| [`reports/`](./reports/) | Project review and Flow deployment verification write-ups |
| [`design/`](./design/) | Product workflow and state-of-play PDFs |
| [`evidence/`](./evidence/) | Historical browser dumps / screenshots from Flow troubleshooting |

New local debug dumps belong under `.tmp*` (gitignored), not the repo root. Keep committed evidence only when it supports a verification report.

## Quick links

- [Editing API](./contracts/editing-api.md)
- [Clip editing](./contracts/clip-editing.md)
- [Flow v3.3 contract](./contracts/flow-v33-contract.md)
- [Batch integration](./guides/batch-integration.md)
- [Concurrent generation](./guides/concurrent-generation.md)
- [Project review](./reports/project-review.md)
- [Flow verification](./reports/flow-verification.md)

## Code map (high level)

```
src/app/            Next.js App Router (dashboard pages + API routes)
src/components/     UI by domain (generate, personas, experimental, …)
src/lib/engine/     Copy generation pipeline (LLM prompts, dedup, score)
src/lib/experimental/  Reel orchestration, Flow client, FFmpeg helpers
src/db/             Drizzle schema + client
shared/flow/        Clip/scene helpers shared with the worker
infra/              Docker, Caddy, deploy scripts, flow-worker sidecar
scripts/            Migrate, seed, reel-runner, Airtable utilities
```
