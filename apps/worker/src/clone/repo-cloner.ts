/**
 * The repo-clone port (ADR-0025 Decision 1). The worker depends on this interface,
 * never on a concrete VCS client, so the clone engine stays swappable: the v1
 * implementation spawns native `git` ({@link GitCloner}); a pure-JS `isomorphic-git`
 * implementation can replace it later with zero change to the delta engine
 * (isolate what varies). A clone is content acquisition only — the bytes are
 * fetched to be parsed, never executed (security baseline).
 */
import type { RepoCoordinates } from '@toopo/queue';
import type { CloneCredentials } from './git-askpass.js';

export interface CloneRequest {
  /** The repo to clone (host/owner/name — the canonical coordinates, ADR-0024 §7). */
  readonly repo: RepoCoordinates;
  /**
   * The exact commit to materialise — a full hex SHA. Validated at the enqueue
   * and claim boundaries; {@link GitCloner} re-asserts the shape before the sha
   * is placed in `git` argv, so it can provably never be parsed as a flag.
   */
  readonly commitSha: string;
  /** An existing, empty directory to populate with the tree at `commitSha`. */
  readonly destination: string;
  /**
   * Optional clone credentials for a private repo (ADR-0026 §5). When present they
   * are fed to `git` through a `GIT_ASKPASS` script — never the remote URL, argv,
   * or refs (ADR-0026 §5). Absent ⇒ a public clone.
   */
  readonly credentials?: CloneCredentials;
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
