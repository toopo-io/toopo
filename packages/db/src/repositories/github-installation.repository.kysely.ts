/**
 * Kysely implementation of {@link GithubInstallationRepository}. Portable across
 * both backends (ADR-0017 §6): the link uses `INSERT … ON CONFLICT DO UPDATE …
 * WHERE … RETURNING`, which libSQL and Postgres share verbatim, so no dialect
 * seam is needed. Every returned row is normalized through the Zod boundary
 * (ADR-0006). Timestamps are written as ISO strings, which both backends accept.
 */
import type { Kysely } from 'kysely';
import type { ProjectDatabase } from '../schema/project-types.js';
import type {
  GithubInstallationRepository,
  LinkInstallationInput,
  LinkInstallationResult,
} from './github-installation.repository.js';
import {
  type GithubInstallationRecord,
  rowToGithubInstallation,
} from './github-installation-records.js';

export class KyselyGithubInstallationRepository implements GithubInstallationRepository {
  constructor(private readonly db: Kysely<ProjectDatabase>) {}

  async linkInstallation(input: LinkInstallationInput): Promise<LinkInstallationResult> {
    const now = new Date().toISOString();
    // ONE atomic statement both guards and classifies: on conflict the row is
    // touched only when the caller already owns it, and RETURNING yields a row
    // exactly when the insert or the guarded update applied. No row means a
    // different user holds the link. No follow-up read, so the classification
    // cannot race a concurrent delete/relink.
    const row = await this.db
      .insertInto('github_installation')
      .values({
        installation_id: input.installationId,
        owner_user_id: input.ownerUserId,
        created_at: now,
        updated_at: now,
      })
      .onConflict((oc) =>
        oc
          .column('installation_id')
          .doUpdateSet({ updated_at: now })
          .where('github_installation.owner_user_id', '=', input.ownerUserId),
      )
      .returningAll()
      .executeTakeFirst();
    return row === undefined
      ? { outcome: 'owner-mismatch' }
      : { outcome: 'linked', record: rowToGithubInstallation(row) };
  }

  async findInstallation(installationId: string): Promise<GithubInstallationRecord | null> {
    const row = await this.db
      .selectFrom('github_installation')
      .selectAll()
      .where('installation_id', '=', installationId)
      .executeTakeFirst();
    return row === undefined ? null : rowToGithubInstallation(row);
  }

  async deleteInstallation(installationId: string): Promise<void> {
    await this.db
      .deleteFrom('github_installation')
      .where('installation_id', '=', installationId)
      .execute();
  }
}
