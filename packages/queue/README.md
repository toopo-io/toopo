# @toopo/queue

The job-queue abstraction behind Toopo's continuous, delta-only ingest: the API
(B3 webhook) **enqueues** a job on every push, a worker (B4) **consumes** it and
analyses the commit. Implements
[ADR-0023](../../docs/adr/0023-job-queue-strategy.md) (extends
[ADR-0017](../../docs/adr/0017-storage-strategy.md)).

A job carries a **reference, never code** (security baseline): a `projectId`, the
repo coordinates, and a commit sha — validated at the enqueue boundary
(ADR-0006). A forged or replayed job can cost compute but cannot smuggle a
payload.

## One port, swappable implementations

The public seam is the `Queue` (producer) + `Consumer` (loop) port. The
implementation is a config switch (ADR-0023 §1):

| Factory | Backend | Claim mechanism |
| --- | --- | --- |
| `createQueue({ databaseUrl })` (Postgres scheme) | Postgres (cloud) | `SELECT … FOR UPDATE SKIP LOCKED` — concurrent workers grab distinct rows |
| `createQueue({ databaseUrl })` (SQLite scheme) | SQLite (self-host) | single-writer serialized `UPDATE … RETURNING` — zero extra service |
| `createInMemoryQueue()` | in-memory | tests / proof the port is impl-agnostic |
| Redis + BullMQ | *(deferred, ADR-0023 §4)* | the broker's own reliability, behind the same port |

The reliability logic — claim → process → ack / retry / dead-letter — is written
**once** as a driver over a swappable `JobStore` (in `@toopo/db`), shared by the
in-memory and DB-backed implementations. The `job` table is migrated globally by
`db:migrate` (`0006_job`), never per-handle (ADR-0008).

```ts
import { createQueue } from '@toopo/queue';

// SQLite self-host or Postgres cloud — same call, the DATABASE_URL scheme decides.
const { queue, createConsumer, close } = createQueue({
  databaseUrl: process.env.DATABASE_URL,
});

// Producer (B3 webhook): enqueue a reference, never code.
await queue.enqueue(
  {
    projectId,
    repo: { host: 'github.com', owner: 'toopo', name: 'toopo' },
    commitSha,
  },
  { dedupeKey: `${projectId}:${commitSha}` }, // idempotent while the job is active
);

// Consumer (B4 worker): the driver handles retries, backoff, and dead-letter.
const consumer = createConsumer({
  handler: async (job) => analyse(job.reference),
  onDeadLetter: (job, error) => alert(`job ${job.id} dead-lettered: ${error}`),
  onError: (error) => log.error('queue loop error', error),
});
const subscription = consumer.start();
```

## Reliability guarantees (ADR-0023 §5)

- **At-least-once delivery.** A crash before ack redelivers after the lease
  expires — so consumers **must** be idempotent. The stable job `id` is handed to
  the handler so re-processing a commit is a no-op.
- **Idempotent enqueue.** An optional `dedupeKey` makes a re-fired webhook a
  no-op while a job with that key is still active (a partial unique index).
- **Retries with exponential backoff + full jitter.** Injected clock and RNG, so
  scheduling is deterministic and testable. Defaults: 5 attempts, 1s base, 5min
  cap.
- **Poison-bounded.** `attempts` is counted on claim (delivery count), so a job
  that crashes the worker is still bounded and dead-letters — it is never
  re-run past the cap.
- **Never-silent dead-letter.** An exhausted job is kept (audited) **and** a
  mandatory `onDeadLetter` sink fires (logged; alert-wired in cloud). Loop infra
  errors surface to a mandatory `onError` sink and the loop survives them.

## The claim seam

The claim is the single, deliberate dialect-specific statement — the one
documented exception to ADR-0017 §6's portable-SQL discipline — because
concurrent at-least-once claim is not portably expressible and the difference
maps exactly onto each backend's concurrency model. Everything else (enqueue,
ack, retry, dead-letter, listing) is portable and exercised dual-backend in CI.

## Dependencies

`@toopo/queue → @toopo/db → @toopo/core`, one-way. The domain `JobReference`,
the reliability driver, and the in-memory store live here; the `JobStore` port,
the `job` table, and the Kysely claim seam live in `@toopo/db`.
