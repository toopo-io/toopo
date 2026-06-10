/**
 * The GitHub-App installation persistence abstraction (ADR-0026 §3), part of the
 * project/tenancy module. Callers depend on this interface, never on Kysely. The
 * post-install redirect upserts the installation_id ⇄ owner_user_id link (the only
 * user-bearing signal); the anonymous installation webhooks resolve the owner
 * through {@link findInstallation} and never create a link themselves.
 */
import type { GithubInstallationRecord } from './github-installation-records.js';

/** The fields the install redirect records to link an installation to a user. */
export interface UpsertInstallationInput {
  readonly installationId: string;
  readonly ownerUserId: string;
}

export interface GithubInstallationRepository {
  /**
   * Record (or re-link) the installation_id ⇄ owner_user_id mapping. Idempotent on
   * the installation id: a redelivered redirect or a re-install updates the owner
   * and refreshes `updated_at`, preserving `created_at`.
   */
  upsertInstallation(input: UpsertInstallationInput): Promise<GithubInstallationRecord>;

  /** The link for an installation id, or `null` when none was recorded yet. */
  findInstallation(installationId: string): Promise<GithubInstallationRecord | null>;

  /** Remove the link (on `installation.deleted`); idempotent for an absent id. */
  deleteInstallation(installationId: string): Promise<void>;
}
