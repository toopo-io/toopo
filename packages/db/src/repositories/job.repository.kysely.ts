/**
 * Kysely implementation of {@link JobStore} (ADR-0023 §2). Every statement is
 * portable across both backends (ADR-0017 §6) — parameterized, keyset-paged, Zod-
 * normalized — EXCEPT the claim, which is the single deliberate dialect seam:
 *
 *   - Postgres: `... FOR UPDATE SKIP LOCKED` inside a CTE so concurrent cloud
 *     workers atomically grab DISTINCT rows with no contention.
 *   - SQLite (libSQL): a single `UPDATE ... WHERE id = (SELECT ... LIMIT 1)
 *     RETURNING *`; libSQL serializes writers, so the self-host single worker
 *     never collides.
 *
 * Both increment `attempts` in the same statement (delivery count, ADR-0023 §5),
 * and both set a fresh lease. The seam is documented in ADR-0023 and is the only
 * exception to the portable-SQL discipline; everything else here is dual-backend.
 *
 * Timestamps are written as UTC ISO-8601 strings — accepted by libSQL `text` and
 * Postgres `timestamptz` (assignment cast) — so the claim's `available_at <= now`
 * predicate orders identically on both backends (ADR-0023 §5).
 */
import { randomUUID } from 'node:crypto';
import { type Insertable, type Kysely, sql } from 'kysely';
import type { DatabaseBackend } from '../config.js';
import type { JobDatabase, JobTable } from '../schema/job-types.js';
import {
  buildPage,
  clampLimit,
  decodeCursorTuple,
  encodeCursor,
  type Page,
  type PageOptions,
} from './graph-page.js';
import type {
  ClaimOptions,
  EnqueueOutcome,
  JobStore,
  NewJobInput,
  QueuedJob,
} from './job.repository.js';
import { type JobRowLike, rowToJob } from './job-records.js';

const ACTIVE_STATUSES = ['ready', 'processing'] as const;

/** Whether a thrown error is a unique-constraint violation on either backend. */
function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  if (code === '23505') {
    return true; // Postgres unique_violation
  }
  if (typeof code === 'string' && code.startsWith('SQLITE_CONSTRAINT')) {
    return true; // libSQL / SQLite
  }
  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' && /unique constraint/i.test(message);
}

export class KyselyJobStore implements JobStore {
  constructor(
    private readonly db: Kysely<JobDatabase>,
    private readonly backend: DatabaseBackend,
  ) {}

  async enqueue(input: NewJobInput, now: Date): Promise<EnqueueOutcome> {
    if (input.dedupeKey !== null) {
      const existing = await this.findActiveByDedupeKey(input.dedupeKey);
      if (existing !== null) {
        return { id: existing.id, deduplicated: true };
      }
    }
    const id = randomUUID();
    const nowIso = now.toISOString();
    const row: Insertable<JobTable> = {
      id,
      dedupe_key: input.dedupeKey,
      project_id: input.projectId,
      repo_host: input.repoHost,
      repo_owner: input.repoOwner,
      repo_name: input.repoName,
      commit_sha: input.commitSha,
      status: 'ready',
      attempts: 0,
      available_at: input.availableAt.toISOString(),
      lease_until: null,
      last_error: null,
      created_at: nowIso,
      updated_at: nowIso,
    };
    try {
      await this.db.insertInto('job').values(row).execute();
      return { id, deduplicated: false };
    } catch (error) {
      // A concurrent enqueue won the active-dedupe race (partial unique index).
      // Resolve to the existing active job rather than surfacing the violation.
      if (input.dedupeKey !== null && isUniqueViolation(error)) {
        const existing = await this.findActiveByDedupeKey(input.dedupeKey);
        if (existing !== null) {
          return { id: existing.id, deduplicated: true };
        }
      }
      throw error;
    }
  }

  claim(options: ClaimOptions): Promise<QueuedJob | null> {
    return this.backend === 'postgres' ? this.claimPostgres(options) : this.claimSqlite(options);
  }

  async ack(id: string): Promise<void> {
    await this.db.deleteFrom('job').where('id', '=', id).execute();
  }

  async retry(id: string, availableAt: Date, error: string, now: Date): Promise<void> {
    await this.db
      .updateTable('job')
      .set({
        status: 'ready',
        available_at: availableAt.toISOString(),
        lease_until: null,
        last_error: error,
        updated_at: now.toISOString(),
      })
      .where('id', '=', id)
      .execute();
  }

  async deadLetter(id: string, error: string, now: Date): Promise<void> {
    await this.db
      .updateTable('job')
      .set({
        status: 'dead',
        lease_until: null,
        last_error: error,
        updated_at: now.toISOString(),
      })
      .where('id', '=', id)
      .execute();
  }

  async listDeadLetters(options?: PageOptions): Promise<Page<QueuedJob>> {
    const limit = clampLimit(options?.limit);
    let query = this.db.selectFrom('job').selectAll().where('status', '=', 'dead');
    if (options?.cursor !== undefined) {
      query = query.where('id', '>', String(decodeCursorTuple(options.cursor, 1)[0]));
    }
    const rows = await query
      .orderBy('id')
      .limit(limit + 1)
      .execute();
    return buildPage(
      rows.map((row) => rowToJob(row as unknown as JobRowLike)),
      limit,
      (job) => encodeCursor([job.id]),
    );
  }

  private async findActiveByDedupeKey(dedupeKey: string): Promise<QueuedJob | null> {
    const row = await this.db
      .selectFrom('job')
      .selectAll()
      .where('dedupe_key', '=', dedupeKey)
      .where('status', 'in', ACTIVE_STATUSES)
      .limit(1)
      .executeTakeFirst();
    return row === undefined ? null : rowToJob(row as unknown as JobRowLike);
  }

  /**
   * Postgres claim — the concurrent-safe seam (ADR-0023 §2). A CTE selects the
   * oldest claimable row with `FOR UPDATE SKIP LOCKED` so parallel workers take
   * distinct rows, then the UPDATE increments `attempts` and sets the lease.
   */
  private async claimPostgres(options: ClaimOptions): Promise<QueuedJob | null> {
    const nowIso = options.now.toISOString();
    const leaseIso = new Date(options.now.getTime() + options.leaseMs).toISOString();
    const result = await sql<JobRowLike>`
      with next as (
        select id from job
        where (status = 'ready' and available_at <= ${nowIso}::timestamptz)
           or (status = 'processing' and lease_until <= ${nowIso}::timestamptz)
        order by available_at
        limit 1
        for update skip locked
      )
      update job
         set status = 'processing',
             attempts = job.attempts + 1,
             lease_until = ${leaseIso}::timestamptz,
             updated_at = ${nowIso}::timestamptz
        from next
       where job.id = next.id
      returning job.*
    `.execute(this.db);
    const row = result.rows[0];
    return row === undefined ? null : rowToJob(row);
  }

  /**
   * SQLite claim — a single atomic `UPDATE ... WHERE id = (SELECT ... LIMIT 1)
   * RETURNING *`. libSQL serializes writers, so the self-host single worker
   * never double-claims; no row locking is needed (ADR-0023 §2).
   */
  private async claimSqlite(options: ClaimOptions): Promise<QueuedJob | null> {
    const nowIso = options.now.toISOString();
    const leaseIso = new Date(options.now.getTime() + options.leaseMs).toISOString();
    const result = await sql<JobRowLike>`
      update job
         set status = 'processing',
             attempts = attempts + 1,
             lease_until = ${leaseIso},
             updated_at = ${nowIso}
       where id = (
         select id from job
          where (status = 'ready' and available_at <= ${nowIso})
             or (status = 'processing' and lease_until <= ${nowIso})
          order by available_at
          limit 1
       )
      returning *
    `.execute(this.db);
    const row = result.rows[0];
    return row === undefined ? null : rowToJob(row);
  }
}
