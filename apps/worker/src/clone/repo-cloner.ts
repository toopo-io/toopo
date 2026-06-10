/**
 * The repo-clone port (ADR-0025 Decision 1). The worker depends on this interface,
 * never on a concrete VCS client, so the clone engine stays swappable: the v1
 * implementation spawns native `git` ({@link GitCloner}); a pure-JS `isomorphic-git`
 * implementation can replace it later with zero change to the delta engine
 * (isolate what varies). A clone is content acquisition only — the bytes are
 * fetched to be parsed, never executed (security baseline).
 */
import type { RepoCoordinates } from '@toopo/queue';

export interface CloneRequest {
  /** The repo to clone (host/owner/name — the canonical coordinates, ADR-0024 §7). */
  readonly repo: RepoCoordinates;
  /** The exact commit to materialise — a full hex SHA (already validated by B3). */
  readonly commitSha: string;
  /** An existing, empty directory to populate with the tree at `commitSha`. */
  readonly destination: string;
}

export interface RepoCloner {
  /**
   * Populate `request.destination` with the repo's working tree at exactly
   * `request.commitSha`. Resolves on success; throws on any failure (bad sha,
   * network/timeout, missing `git`) so the caller can retry / dead-letter via the
   * queue's reliability (ADR-0023).
   */
  clone(request: CloneRequest): Promise<void>;
}
