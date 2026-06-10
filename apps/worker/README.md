# @toopo/worker

The worker turns a repo at a commit into the live, project-scoped code graph. It
has two modes over the same `@toopo/ingest` pipeline and `@toopo/db` store:

- **`ingest` (populate CLI)** — a one-shot ingest of a local directory into the
  graph; the bootstrap/dogfood path (ADR-0020 Fork 5).
- **`consume` (queue worker)** — the long-lived consumer that closes the
  push→cartography loop: it drains `@toopo/queue`, clones each pushed commit,
  ingests the delta, and persists it (ADR-0025).

## Consume mode — the push→cartography loop

`pnpm --filter @toopo/worker consume` (env `DATABASE_URL`) starts a consumer that,
for each reference-only job the webhook enqueued (`{ projectId, repo, commitSha }`,
ADR-0024):

1. **Clone** the repo at exactly `commitSha` into a per-job sandbox — native `git`
   spawned with an argv array (no shell, no injection), a hardened env (no
   credential/hook/LFS execution, `file`/`https` transports only), and a `--depth 1`
   fetch of the sha. The sandbox is always removed, even on failure. Content is
   parsed, never executed (security baseline). See [`src/clone/`](src/clone/).
2. **Delta-ingest** — hash every file (the delta authority); re-parse only files
   whose bytes changed, reuse the rest from the global content-hash parse cache
   (`parse_fragment`), then FULL-resolve over the complete fragment set. If the
   clone is byte-identical to the stored graph, the run short-circuits to a no-op.
   See [`@toopo/ingest`'s `ingestDelta`](../../packages/ingest/src/ingest/ingest-delta.ts).
3. **Persist** — `replaceProjectGraph` atomically replaces the project's whole
   graph with the freshly resolved document (additions, modifications, deletions,
   and re-bound cross-file edges), scoped by `projectId` (ADR-0022).

Re-delivering or retrying a commit is a true no-op (idempotent). A failure throws,
so the queue retries with backoff and dead-letters past the cap — never silently
(ADR-0023). One job per process; scale by running more processes (the queue is the
scaling seam — Postgres `FOR UPDATE SKIP LOCKED` hands distinct jobs to each).

`SIGINT`/`SIGTERM` trigger a graceful shutdown: stop claiming, drain the in-flight
job, then close every connection.

### Runtime prerequisite: `git`

The consume path shells out to native `git`, so **`git` must be on `PATH`** wherever
the consumer runs. It is a runtime tool needing no compiler — categorically unlike
the install-time native builds the self-host mandate rejects (ADR-0025 Decision 1).
The `ingest` populate CLI and a self-host without a connected GitHub App need no
`git`. A pure-JS cloner (`isomorphic-git`) is a future drop-in behind the
`RepoCloner` port.

## Run locally

```bash
pnpm install
# One-shot populate of a directory:
pnpm --filter @toopo/worker ingest -- <dir> --database-url <url> \
  --repo-host github.com --repo-owner <owner> --repo-name <name>
# Long-lived queue consumer (git required):
DATABASE_URL=<url> pnpm --filter @toopo/worker consume
```

The database must already be migrated (`pnpm --filter @toopo/db db:migrate`, never
on boot — ADR-0008).

## Environment variables

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `DATABASE_URL` | SQLite (`file:`/`libsql:`) or Postgres URL | — | Target database; the scheme selects the backend (ADR-0017). Required by `consume`. |

## Project layout

```
src/
├── cli/        # ingest populate CLI (args, run, bin)
├── clone/      # RepoCloner port + hardened GitCloner + sandbox (ADR-0025 §1, §7)
├── consume/    # ingest-job-handler, startConsume, graceful shutdown, bin
└── ingest-and-persist.ts  # the populate composition
test/support/   # offline git-fixture + dual-backend URL harness (e2e)
```

## Related ADRs

- [ADR-0025](../../docs/adr/0025-worker-ingest-clone-and-incremental-persist.md) —
  worker ingest: shallow clone, content-hash delta, parse-fragment cache,
  full-resolve + full-replace persist, one-job-per-process.
- [ADR-0024](../../docs/adr/0024-github-push-webhook-ingestion.md) — the webhook
  that enqueues the reference-only jobs this worker drains.
- [ADR-0023](../../docs/adr/0023-job-queue-strategy.md) — the `Queue`/`Consumer`
  port: at-least-once, idempotent, backoff retries, never-silent dead-letter.
- [ADR-0016](../../docs/adr/0016-parsing-and-resolution-strategy.md) — file-level
  incremental, content-hash cache, clone (not the GitHub API).
- [ADR-0017](../../docs/adr/0017-storage-strategy.md) — dual-backend persistence
  (SQLite self-host / Postgres cloud).
