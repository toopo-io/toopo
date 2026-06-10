/**
 * A MINIMAL schema for a GitHub `push` event (ADR-0024 §4, ADR-0006). The
 * payload is untrusted, so it is validated at the boundary — but only the fields
 * the receiver actually uses are modelled; `.passthrough()` keeps GitHub's many
 * other fields without coupling us to them or rejecting future additions.
 *
 * `after` is the head commit the push landed (or the all-zero sha on a branch
 * delete, which the branch-scope check excludes before any enqueue). The strict
 * commit-sha shape is enforced later by the queue's `JobReference` on enqueue.
 */
import { z } from 'zod';

const GithubPushRepositorySchema = z
  .object({
    name: z.string().trim().min(1),
    default_branch: z.string().trim().min(1),
    owner: z
      .object({
        login: z.string().trim().min(1),
      })
      .passthrough(),
  })
  .passthrough();

export const GithubPushEventSchema = z
  .object({
    /** The fully-qualified ref the push updated, e.g. `refs/heads/main`. */
    ref: z.string().trim().min(1),
    /** The commit the ref now points at (all-zero sha on a branch delete). */
    after: z.string().trim().min(1),
    /** True when the push deleted the ref. */
    deleted: z.boolean().optional(),
    repository: GithubPushRepositorySchema,
  })
  .passthrough();

export type GithubPushEvent = z.infer<typeof GithubPushEventSchema>;
