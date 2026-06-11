/**
 * Kysely implementation of {@link WorkspaceRepository}. Portable across both
 * backends (ADR-0017 §6): a single parameterized existence probe over the
 * organization-plugin `organization` table, selecting one column with a `limit 1`
 * so it never materializes the row.
 */
import type { Kysely } from 'kysely';
import type { AuthDatabase } from '../schema/auth-types.js';
import type { WorkspaceRepository } from './workspace.repository.js';

export class KyselyWorkspaceRepository implements WorkspaceRepository {
  constructor(private readonly db: Kysely<AuthDatabase>) {}

  async exists(workspaceId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('organization')
      .select('id')
      .where('id', '=', workspaceId)
      .limit(1)
      .executeTakeFirst();
    return row !== undefined;
  }
}
