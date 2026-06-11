/**
 * Kysely implementation of {@link MembershipRepository}. Portable across both
 * backends (ADR-0017 §6): no dialect-specific SQL, parameterized everywhere.
 * `createdAt` is compared as written (ISO strings from libSQL, `timestamptz`
 * from Postgres) — both order chronologically — and the workspace id tiebreak
 * makes the result deterministic regardless of equal timestamps.
 */
import type { Kysely } from 'kysely';
import type { AuthDatabase } from '../schema/auth-types.js';
import type { MembershipRepository } from './membership.repository.js';

export class KyselyMembershipRepository implements MembershipRepository {
  constructor(private readonly db: Kysely<AuthDatabase>) {}

  async findFirstWorkspaceId(userId: string): Promise<string | null> {
    const row = await this.db
      .selectFrom('member')
      .select('organizationId')
      .where('userId', '=', userId)
      .orderBy('createdAt', 'asc')
      .orderBy('organizationId', 'asc')
      .limit(1)
      .executeTakeFirst();
    return row?.organizationId ?? null;
  }

  async isMember(userId: string, workspaceId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('member')
      .select('id')
      .where('userId', '=', userId)
      .where('organizationId', '=', workspaceId)
      .limit(1)
      .executeTakeFirst();
    return row !== undefined;
  }

  async listWorkspaceIds(userId: string): Promise<readonly string[]> {
    const rows = await this.db
      .selectFrom('member')
      .select('organizationId')
      .where('userId', '=', userId)
      .orderBy('createdAt', 'asc')
      .orderBy('organizationId', 'asc')
      .execute();
    return rows.map((row) => row.organizationId);
  }

  async isWorkspaceOwner(userId: string, workspaceId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('member')
      .select('id')
      .where('userId', '=', userId)
      .where('organizationId', '=', workspaceId)
      .where('role', '=', 'owner')
      .limit(1)
      .executeTakeFirst();
    return row !== undefined;
  }
}
