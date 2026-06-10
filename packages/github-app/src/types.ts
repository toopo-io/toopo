/**
 * The domain types of the GitHub-App auth surface (ADR-0026). Deliberately narrow:
 * the connect flow and the worker need only an installation token, the repos an
 * installation grants, and a repo's default-branch HEAD — nothing of GitHub's wide
 * REST surface leaks past this boundary.
 */

/** A short-lived, per-installation access token (ADR-0026 §5). */
export interface InstallationToken {
  /** The `x-access-token` password used for an authenticated clone. Never logged. */
  readonly token: string;
  /** Absolute expiry (GitHub mints ~1h tokens); refreshed before this elapses. */
  readonly expiresAt: Date;
}

/** A repository an installation grants access to (the `github.com` owner/name pair). */
export interface InstallationRepo {
  readonly owner: string;
  readonly name: string;
}

/** A repository's default branch and the commit currently at its HEAD (first scan). */
export interface DefaultBranchHead {
  readonly defaultBranch: string;
  readonly commitSha: string;
}
