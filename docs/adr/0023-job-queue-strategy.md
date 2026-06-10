# ADR 0023: Job-queue strategy — abstract queue port, DB-backed dual-backend + in-memory impls, Redis/BullMQ deferred

Date: 2026-06-10
Status: Accepted

Extends ADR-0017 (reuses the dual-backend store; fulfils the queue-backend
pointer ADR-0017 left open). Supersedes nothing.

## Context

Phase B needs continuous, delta-only ingest: the API (B3 webhook) enqueues a
job on every push, a worker (B4) consumes it and analyses the commit. That
demands a reliable queue — at-least-once delivery, idempotent consumers,
retries, and a dead-letter path that is never silent.

The product brief assumed a Postgres self-host queue, but ADR-0017 made
self-host a single **SQLite (libSQL)** file with **zero managed services**, and
cloud **Postgres**. A queue must honour that same constraint: self-host adds no
broker; cloud scales workers. ADR-0017 §Context explicitly deferred "the task
queue backend… gets its own ADR next" — this is it.

A job must carry a **reference, never the code** (security baseline): a forged
or replayed job can cost compute but cannot smuggle a payload.

## Decision

1. **One `Queue` + `Consumer` port; the implementation is a config switch**
   (`createQueue({ databaseUrl })`), mirroring ADR-0017 §1's "switch by config,
   not code". The port — not a storage interface — is the public seam, because a
   smart broker (BullMQ) carries its own reliability and cannot be modelled as a
   dumb store.

2. **DB-backed implementation over `@toopo/db`** — "zero extra service" for
   self-host. A shared reliability driver runs over a swappable `JobStore`:
   **SQLite** claims with a serialized single-writer `UPDATE … WHERE id = (SELECT
   … LIMIT 1) RETURNING`; **Postgres** claims with `… FOR UPDATE SKIP LOCKED` so
   multiple cloud workers grab distinct rows. The claim is the **single,
   deliberate dialect-specific seam** — a bounded exception to ADR-0017 §6's
   portable-SQL discipline, justified because concurrent at-least-once claim is
   not portably expressible and the difference maps exactly onto each backend's
   concurrency model. Every other statement stays portable and is exercised on
   both backends by the existing harness.

3. **In-memory implementation** proves the port is implementation-agnostic
   (tests, the trivial producer/consumer proof). Two `JobStore` impls (in-memory
   + Kysely) under one driver, the Kysely one itself on two backends.

4. **Redis + BullMQ deferred** as the documented future cloud-scale impl behind
   the same port (YAGNI until a cloud deployment needs it). It would bring its
   own DLQ/retry/backoff, bypassing the driver — never forced into self-host.

5. **Reliability guarantees.** At-least-once delivery (a crash before ack
   redelivers after lease expiry; consumers MUST be idempotent). Idempotency in
   two layers: an optional `dedupeKey` makes enqueue idempotent while a job is
   active, and the stable job id lets a consumer no-op a redelivered commit.
   `attempts` is incremented **on claim** (delivery count), so a poison job that
   crashes the worker is still bounded and eventually dead-letters. Retries use
   **exponential backoff + full jitter** with an injected clock and RNG
   (determinism). Dead-letter is **never silent**: the row is kept (audited) and
   a mandatory sink fires (structured error log; alert-wired in cloud).

6. **Boundaries.** The `job` table, its migration, and `JobStore` live in
   `@toopo/db` beside the one migrator and the dual-backend CI harness;
   `@toopo/queue` owns the domain port, the reliability driver, the in-memory
   store, and the DB-backed `Queue`. Dependency is one-way: `queue → db → core`.
   The reference payload is Zod-validated at the enqueue boundary (ADR-0006).

## Consequences

- Self-host needs no broker; cloud scales workers via SKIP LOCKED.
- The standing portability cost is just the one claim seam; everything else is
  dual-backend-tested, so non-portable drift fails fast in CI.
- The reliability logic (backoff, retry decision, dead-letter dispatch) is
  written once over the port and unit-tested deterministically.
- Redis is a later drop-in: a new `Queue` impl, no change to producers/consumers.
- Accepted limit: at-least-once, not exactly-once — consumers carry the
  idempotency obligation, which the stable job id supports.

## Alternatives considered

- **Postgres self-host queue (the brief's assumption).** Rejected: contradicts
  ADR-0017's SQLite-self-host constraint — it would force a Postgres service into
  every self-host install.
- **Redis + BullMQ now.** Rejected: YAGNI, and it forces a mandatory broker into
  self-host, breaking "one file, zero services".
- **BullMQ as the only implementation.** Rejected: needs Redis for self-host;
  same constraint violation.
- **A fully-portable claim without `SKIP LOCKED`** (a compare-and-swap UPDATE on
  both backends). Rejected: under cloud concurrency every worker contends on the
  same head row, wasting work; the seam is small, honest, and ADR-recorded.
- **A separate queue database and its own dual-backend harness.** Rejected:
  duplicates `@toopo/db`'s migrator and the portable-SQL CI gate — the charter
  forbids the duplication.

## Related ADRs

- **Extends ADR-0017** (dual-backend store — the queue reuses its migrator,
  harness, and connection factory; the claim seam is a bounded exception to its
  §6 portable-SQL discipline).
- ADR-0006 (Zod at boundaries — the reference payload is validated on enqueue).
- ADR-0008 (explicit migrations, never on boot — `0006_job` runs via `db:migrate`).
- ADR-0020 (Serve pass — `apps/worker` is the precursor consumer this unblocks).
- ADR-0022 (project tenancy — the job reference carries the `projectId` scope and
  the repo coordinates).
