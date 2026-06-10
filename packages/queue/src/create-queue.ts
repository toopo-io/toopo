/**
 * The config-selected factory (ADR-0023 §1): `createQueue({ databaseUrl })` builds
 * a DB-backed queue whose backend — SQLite self-host vs Postgres cloud, and thus
 * which claim seam — is chosen by the DATABASE_URL scheme (reusing `@toopo/db`'s
 * inference). Switching backend is a config change, never a code change.
 *
 * The handle bundles the producer {@link Queue} and a {@link createConsumer}
 * bound to the SAME store, plus `db`/`backend` for the explicit migrate step
 * (ADR-0008 — never on boot) and a `close`. `createInMemoryQueue` is the same
 * wiring over an {@link InMemoryJobStore}, for tests and the impl-agnostic proof.
 */
import { createJobDatabase, type DatabaseBackend, type JobStore } from '@toopo/db';
import { type Consumer, type ConsumerOptions, createConsumer } from './consumer.js';
import { InMemoryJobStore } from './in-memory-job-store.js';
import { JobStoreQueue, type Queue } from './queue.js';

export interface CreateQueueOptions {
  /** The target database; the scheme selects the backend (ADR-0017 §1). */
  readonly databaseUrl: string;
  /** Injected clock for enqueue timestamps. Defaults to `() => new Date()`. */
  readonly clock?: () => Date;
}

export interface QueueHandle {
  /** The producer surface (the B3 webhook enqueues here). */
  readonly queue: Queue;
  /** Build a consumer bound to this queue's store (the B4 worker consumes here). */
  createConsumer(options: ConsumerOptions): Consumer;
  /**
   * The resolved backend (informational). The `job` table is migrated globally by
   * `db:migrate` (0006_job) — never per-handle, never on boot (ADR-0008) — so the
   * handle exposes no connection of its own.
   */
  readonly backend: DatabaseBackend;
  /** Closes the underlying connection (call on shutdown). */
  close(): Promise<void>;
}

/** An in-memory queue handle — no connection, nothing to migrate or close-fail. */
export interface InMemoryQueueHandle {
  readonly queue: Queue;
  createConsumer(options: ConsumerOptions): Consumer;
  /** The shared store, exposed for assertions in tests. */
  readonly store: JobStore;
}

function bindConsumer(store: JobStore) {
  return (options: ConsumerOptions): Consumer => createConsumer(store, options);
}

export function createQueue(options: CreateQueueOptions): QueueHandle {
  const handle = createJobDatabase({ databaseUrl: options.databaseUrl });
  const clock = options.clock ?? (() => new Date());
  return {
    queue: new JobStoreQueue(handle.jobStore, clock),
    createConsumer: bindConsumer(handle.jobStore),
    backend: handle.backend,
    close: () => handle.close(),
  };
}

export function createInMemoryQueue(clock: () => Date = () => new Date()): InMemoryQueueHandle {
  const store = new InMemoryJobStore();
  return {
    queue: new JobStoreQueue(store, clock),
    createConsumer: bindConsumer(store),
    store,
  };
}
