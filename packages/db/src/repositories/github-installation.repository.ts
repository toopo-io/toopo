/**
 * The GitHub-App installation persistence abstraction (ADR-0026 §3), part of the
 * project/tenancy module. Callers depend on this interface, never on Kysely. The
 * post-install redirect links the installation_id ⇄ owner_user_id pair (the only
 * user-bearing signal); the anonymous installation webhooks resolve the owner
 * through {@link findInstallation} and never create a link themselves.
 */
import type { GithubInstallationRecord } from './github-installation-records.js';

/** The fields the install redirect records to link an installation to a user. */
export interface LinkInstallationInput {
  readonly installationId: string;
  readonly ownerUserId: string;
}

/**
 * The outcome of {@link GithubInstallationRepository.linkInstallation}: `linked`
 * carries the persisted record; `owner-mismatch` means a different user already
 * holds the link, which was left untouched. The mismatch arm deliberately carries
 * no record — the holder's identity must never travel toward the rejected caller.
 */
export type LinkInstallationResult =
  | { readonly outcome: 'linked'; readonly record: GithubInstallationRecord }
  | { readonly outcome: 'owner-mismatch' };

export interface GithubInstallationRepository {
  /**
   * Record the installation_id ⇄ owner_user_id mapping. Idempotent for the same
   * owner (a redelivered redirect or a re-install refreshes `updated_at`,
   * preserving `created_at`), and it never re-points a link held by a different
   * owner (ADR-0026 §7 hardening): the id frees up only when the real
   * `installation.deleted` webhook removes the link.
   */
  linkInstallation(input: LinkInstallationInput): Promise<LinkInstallationResult>;

  /** The link for an installation id, or `null` when none was recorded yet. */
  findInstallation(installationId: string): Promise<GithubInstallationRecord | null>;

  /** Remove the link (on `installation.deleted`); idempotent for an absent id. */
  deleteInstallation(installationId: string): Promise<void>;
}
