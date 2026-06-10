/**
 * The job payload (ADR-0023 §5, security baseline): a job carries a *reference*
 * to a commit, NEVER the code itself. A forged or replayed job can cost compute
 * but cannot smuggle a payload.
 *
 * The schema is `.strict()` on every object: any extra field (a stray `code`,
 * `patch`, `diff`, `content`…) is REJECTED at the enqueue boundary (ADR-0006),
 * making the reference-only contract type- and runtime-enforced rather than
 * merely conventional.
 *
 * `JobReference` is the queue's domain shape — repo coordinates nested under
 * `repo` (queue-local, ADR-0023 §6 fork F5). `@toopo/db`'s `JobStore` speaks a
 * flat storage record; the mapping between the two lives in this package, so the
 * dependency stays one-way (`queue → db`).
 */
import { z } from 'zod';

/** A git object id: full SHA-1 (40) or SHA-256 (64), lowercase hex. */
const CommitShaSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-f]{40}$|^[0-9a-f]{64}$/, {
    message: 'commitSha must be a full lowercase hex SHA-1 (40) or SHA-256 (64)',
  });

const RepoCoordinatesSchema = z
  .object({
    host: z.string().trim().min(1, { message: 'repo.host must not be empty' }),
    owner: z.string().trim().min(1, { message: 'repo.owner must not be empty' }),
    name: z.string().trim().min(1, { message: 'repo.name must not be empty' }),
  })
  .strict();

export const JobReferenceSchema = z
  .object({
    /** The tenancy scope the resulting graph is partitioned by (ADR-0022). */
    projectId: z.string().trim().min(1, { message: 'projectId must not be empty' }),
    /** The connected repo the commit belongs to. */
    repo: RepoCoordinatesSchema,
    /** The exact commit to analyse — a reference, never its contents. */
    commitSha: CommitShaSchema,
  })
  .strict();

/** The host/owner/name of a connected repo (ADR-0022). */
export type RepoCoordinates = z.infer<typeof RepoCoordinatesSchema>;

/** A reference-only unit of work (ADR-0023 §5). */
export type JobReference = z.infer<typeof JobReferenceSchema>;

/**
 * Validates an untrusted reference at the enqueue boundary (ADR-0006). Throws a
 * `ZodError` with a precise path on any malformed, missing, or extra field —
 * never silently coerces.
 */
export function parseJobReference(input: unknown): JobReference {
  return JobReferenceSchema.parse(input);
}
