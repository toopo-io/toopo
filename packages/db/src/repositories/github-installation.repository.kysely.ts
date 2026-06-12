/**
 * Kysely implementation of {@link GithubInstallationRepository}. Portable across
 * both backends (ADR-0017 §6): the link uses `INSERT … ON CONFLICT DO UPDATE …
 * WHERE`, which libSQL and Postgres share verbatim, so no dialect seam is needed.
 * Every returned row is normalized through the Zod boundary (ADR-0006). Timestamps
 * are written as ISO strings, which both backends accept.
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
    // The owner guard lives in the statement itself (no read-then-write race):
    // on conflict the row is touched only when the caller already owns it, so a
    // link held by a different user is provably never re-pointed.
    await this.db
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
      .execute();
    const persisted = await this.findInstallation(input.installationId);
    if (persisted === null) {
      throw new Error(`github_installation link did not persist id=${input.installationId}`);
    }
    return persisted.ownerUserId === input.ownerUserId
      ? { outcome: 'linked', record: persisted }
      : { outcome: 'owner-mismatch' };
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
