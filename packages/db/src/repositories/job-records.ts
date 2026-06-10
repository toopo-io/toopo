/**
 * The boundary Zod schema that normalizes a raw `job` row into a validated
 * {@link QueuedJob} (ADR-0006, ADR-0017 §10). Reads cross two backends with
 * different runtime types — timestamps as `Date` (Postgres) vs ISO `string`
 * (libSQL), integers as `number` — coerced here so callers see one clean
 * camelCase shape regardless of backend. The snake_case→camelCase mapping is
 * explicit in {@link rowToJob}, mirroring {@link rowToProject}.
 */
import { z } from 'zod';
import type { JobStatus, QueuedJob } from './job.repository.js';

const dbDate = z.coerce.date();
const JOB_STATUSES = ['ready', 'processing', 'dead'] as const satisfies readonly JobStatus[];

export const JobRecordSchema = z.object({
  id: z.string(),
  dedupeKey: z.string().nullable(),
  projectId: z.string(),
  repoHost: z.string(),
  repoOwner: z.string(),
  repoName: z.string(),
  commitSha: z.string(),
  status: z.enum(JOB_STATUSES),
  attempts: z.coerce.number().int().nonnegative(),
  availableAt: dbDate,
  leaseUntil: dbDate.nullable(),
  lastError: z.string().nullable(),
  createdAt: dbDate,
  updatedAt: dbDate,
});

/** A raw `job` row as read from either backend (timestamps/ints in native form). */
export interface JobRowLike {
  readonly id: string;
  readonly dedupe_key: string | null;
  readonly project_id: string;
  readonly repo_host: string;
  readonly repo_owner: string;
  readonly repo_name: string;
  readonly commit_sha: string;
  readonly status: string;
  readonly attempts: number | bigint | string;
  readonly available_at: Date | string;
  readonly lease_until: Date | string | null;
  readonly last_error: string | null;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
}

/** Map a snake_case job row to a validated camelCase {@link QueuedJob} (boundary parse). */
export function rowToJob(row: JobRowLike): QueuedJob {
  return JobRecordSchema.parse({
    id: row.id,
    dedupeKey: row.dedupe_key,
    projectId: row.project_id,
    repoHost: row.repo_host,
    repoOwner: row.repo_owner,
    repoName: row.repo_name,
    commitSha: row.commit_sha,
    status: row.status,
    attempts: row.attempts,
    availableAt: row.available_at,
    leaseUntil: row.lease_until,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}
