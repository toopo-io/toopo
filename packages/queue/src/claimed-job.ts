/**
 * The consumer-facing view of a claimed unit of work (ADR-0023 §3) and the
 * mapping between the queue's nested domain `JobReference` (fork F5, queue-local)
 * and `@toopo/db`'s flat `JobStore` records. Keeping the mapping here is what lets
 * the dependency stay one-way (`queue → db`): db never learns the domain shape.
 */
import type { NewJobInput, QueuedJob } from '@toopo/db';
import type { JobReference } from './job-reference.js';

/** What a consumer handler receives: the reference plus the delivery envelope. */
export interface ClaimedJob {
  readonly id: string;
  /** The reference-only payload to act on (ADR-0023 §5). */
  readonly reference: JobReference;
  /** Delivery count including this one (incremented on claim, ADR-0023 §5). */
  readonly attempts: number;
  /** The idempotency key the job was enqueued under, if any. */
  readonly dedupeKey: string | null;
}

/** Project a stored `QueuedJob` into the nested domain `ClaimedJob`. */
export function toClaimedJob(job: QueuedJob): ClaimedJob {
  return {
    id: job.id,
    reference: {
      projectId: job.projectId,
      repo: { host: job.repoHost, owner: job.repoOwner, name: job.repoName },
      commitSha: job.commitSha,
    },
    attempts: job.attempts,
    dedupeKey: job.dedupeKey,
  };
}

/** Flatten a domain `JobReference` into the storage `NewJobInput` the store accepts. */
export function toNewJobInput(
  reference: JobReference,
  options: { readonly dedupeKey: string | null; readonly availableAt: Date },
): NewJobInput {
  return {
    dedupeKey: options.dedupeKey,
    projectId: reference.projectId,
    repoHost: reference.repo.host,
    repoOwner: reference.repo.owner,
    repoName: reference.repo.name,
    commitSha: reference.commitSha,
    availableAt: options.availableAt,
  };
}
