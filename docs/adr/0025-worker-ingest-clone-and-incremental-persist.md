# ADR 0025: Worker ingest — shallow clone, content-hash delta, parse-fragment cache, full-resolve + full-replace persist

Date: 2026-06-10
Status: Accepted

Extends ADR-0016 (parsing & resolution — this records the clone strategy and the
delta mechanism it deferred) and ADR-0017 (storage — this chooses the v1 persist
op in place of the `replaceFileSubgraph` it deferred). Relates to ADR-0023 (the
`Queue`/`Consumer` port the worker drains) and ADR-0024 (the webhook that
produces the jobs). Supersedes nothing; edits neither 0016 nor 0017.

## Context

ADR-0024 ends with a reference-only job `{ projectId, repo, commitSha }` on the
queue. B4 is the consumer that turns it into a live graph: clone the repo at the
commit, ingest only what changed, persist scoped to the project, idempotently —
closing the push→cartography loop. ADR-0016 mandated file-level incremental
re-analysis driven by the content hash and "clone, not the GitHub API", but
deferred *how*. Three forces constrain the *how*: **trivial self-hosting** (the
constraint behind `web-tree-sitter` and libSQL), **determinism** (the same commit
⇒ the same graph), and the **trust principle** (a stale edge is a false positive —
the cardinal sin).

## Decision

1. **Clone with native `git`, behind a `RepoCloner` port.** The worker spawns
   `git` with an argv array (`shell: false` — no shell, no injection), hardened
   env (`GIT_TERMINAL_PROMPT=0`, `GIT_CONFIG_NOSYSTEM=1`, `GIT_LFS_SKIP_SMUDGE=1`,
   `core.hooksPath=` so no repo hook runs), and a `--depth 1` fetch of the exact
   `commitSha`. `git` is a **runtime prerequisite of the consume path only** — a
   runtime tool present on any machine ingesting git pushes, needing no compiler,
   categorically unlike the install-time native builds the self-host mandate
   rejects. The port keeps `isomorphic-git` (pure-JS, zero-binary) available as a
   future second implementation with zero core change (isolate what varies).

2. **The content hash is the delta authority; git is transport only.** Clone the
   tree at `commitSha`, `sha256` every file, compare against the project's stored
   file hashes. Changed/new ⇒ reparse; in-store-but-absent ⇒ delete; equal ⇒ skip;
   no stored hashes ⇒ full first scan. `git diff parent..commit` is **rejected** as
   the delta source: it is correct only if the stored graph is exactly `parent`,
   which the queue's at-least-once redelivery, retries, and out-of-order processing
   never guarantee. Content-hash comparison is correct regardless of which commit
   the stored graph came from — and is exactly ADR-0016's stated mechanism.

3. **A global content-hash parse-fragment cache delivers parse-skip without
   breaking resolve.** Full resolve (resolver v1) needs *all* fragments, but we
   want to *parse* only changed files. Because a parse is a pure function of file
   bytes (ADR-0016), its fragment is cacheable by content hash. The cache is
   keyed by hash alone (cross-project — identical bytes parse identically), so a
   file unchanged since the last push, or shared across projects, is a cache hit.
   GC of stale entries is deferred (YAGNI; append-only is correct, only unbounded).

4. **Persist is a transactional full-project replace (`replaceProjectGraph`), not
   per-file.** In one transaction: delete the project's nodes and edges, then
   insert the freshly resolved document. Per-file `replaceFileSubgraph` is
   **deferred** (ADR-0017 Decision 4 stays deferred): under *full* resolve, a
   change in file A can re-bind an edge **sourced in an unchanged file C** (C
   imports a symbol A removed); replacing only content-changed files would leave
   C's stale edge — a false positive. Full replace is the only sound v1 op while
   resolve is full; per-file replace becomes correct only once resolve is
   incremental (a later ADR). The single transaction means concurrent readers see
   the old graph or the new one, never an empty window (SQLite WAL / Postgres MVCC),
   and a job that dies mid-persist leaves no partial state.

5. **Idempotency by construction.** A re-delivered or retried commit hashes to the
   same set; the short-circuit (stored hashes == clone hashes, nothing removed)
   acks with zero parse and zero writes — a true no-op. Past the retry cap a job
   dead-letters through the queue's never-silent sink (ADR-0023).

6. **One job per worker process; scale by process count.** Each job is a heavy
   clone + parse; in-process fan-out adds cleanup hazard for no gain. The queue is
   the scaling seam — Postgres `FOR UPDATE SKIP LOCKED` hands distinct jobs to many
   processes; SQLite self-host runs exactly one writer.

7. **Untrusted content is parsed, never executed.** A reference-only job; a
   per-job sandbox temp dir with guaranteed `finally` cleanup; the hardened spawn
   of Decision 1; resource bounds (depth 1, clone wall-clock timeout, repo-size and
   per-file caps → abort → dead-letter past cap); tree-sitter reads bytes only — no
   install, run, or eval; hooks disabled.

## Consequences

- The push→cartography loop closes: a default-branch push updates the live,
  project-scoped graph, delta-only, deterministically.
- Steady-state latency is parse-cost on changed files only (the cache absorbs the
  rest); resolve and persist are full but cheap relative to parse (ADR-0016).
- New `@toopo/db` surface: `replaceProjectGraph`, `getFileContentHashes`, and the
  `parse_fragment` cache table — all portable, CI-tested on both backends.
- `git` becomes a documented runtime prerequisite for the consume path (not for
  the populate CLI, not for self-host without a worker).
- Accepted debt, each with its trigger: per-file persist waits on incremental
  resolve; cache GC waits on real growth pressure; the blobless `git diff`
  transport optimization waits on storing the head commit per project.

## Alternatives considered

- **`git diff parent..commit` for the delta.** Rejected (Decision 2): assumes
  stored == parent, which the queue model breaks.
- **`replaceFileSubgraph` per changed file now.** Rejected (Decision 4): unsound
  under full resolve — leaves stale cross-file edges.
- **`isomorphic-git` for v1.** Rejected: slower and higher-memory on real repos,
  and fetch-arbitrary-sha is fiddly; kept viable behind the port for later.
- **In-process job concurrency.** Rejected (Decision 6): the queue already is the
  scaling seam; process-level scale is simpler and safe on both backends.

## Related ADRs

- **Extends ADR-0016** (file-level incremental, content-hash cache, clone-not-API —
  made concrete here).
- **Extends ADR-0017** (`replaceProjectGraph` as the v1 persist; `replaceFileSubgraph`
  stays deferred).
- ADR-0023 (the `Queue`/`Consumer` port, at-least-once, retries, dead-letter).
- ADR-0024 (the webhook that enqueues the reference-only jobs this worker drains).
- ADR-0015 (the graph model persisted; the `sha256` content hash).
- ADR-0006 (Zod at boundaries — cached fragments revalidate on read).
- ADR-0022 (the `GraphScope` every read/write is partitioned by).
