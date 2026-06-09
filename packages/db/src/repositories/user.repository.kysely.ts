/**
 * Kysely implementation of {@link UserRepository}. Portable across both
 * backends (ADR-0017 §6): no dialect-specific SQL, parameterized everywhere,
 * and every row normalized through the Zod boundary schemas before it leaves
 * the repository. `deletedAt` is written as an ISO string, which Postgres and
 * libSQL both accept.
 */
import type { Kysely } from 'kysely';
import type { AuthDatabase } from '../schema/auth-types.js';
import type { UserRepository } from './user.repository.js';
import {
  type AccountRecord,
  AccountRecordSchema,
  type SessionRecord,
  SessionRecordSchema,
  type UserRecord,
  UserRecordSchema,
} from './user-records.js';

export class KyselyUserRepository implements UserRepository {
  constructor(private readonly db: Kysely<AuthDatabase>) {}

  async findDeletedAt(userId: string): Promise<Date | null | undefined> {
    const row = await this.db
      .selectFrom('user')
      .select('deletedAt')
      .where('id', '=', userId)
      .executeTakeFirst();
    if (row === undefined) {
      return undefined;
    }
    return row.deletedAt === null ? null : new Date(row.deletedAt);
  }

  async isActive(userId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('user')
      .select('deletedAt')
      .where('id', '=', userId)
      .executeTakeFirst();
    return row !== undefined && row.deletedAt === null;
  }

  async findUserById(userId: string): Promise<UserRecord | null> {
    const row = await this.db
      .selectFrom('user')
      .selectAll()
      .where('id', '=', userId)
      .executeTakeFirst();
    return row === undefined ? null : UserRecordSchema.parse(row);
  }

  async listSessions(userId: string): Promise<readonly SessionRecord[]> {
    const rows = await this.db
      .selectFrom('session')
      .selectAll()
      .where('userId', '=', userId)
      .execute();
    return rows.map((row) => SessionRecordSchema.parse(row));
  }

  async listAccounts(userId: string): Promise<readonly AccountRecord[]> {
    const rows = await this.db
      .selectFrom('account')
      .selectAll()
      .where('userId', '=', userId)
      .execute();
    return rows.map((row) => AccountRecordSchema.parse(row));
  }

  async softDeleteUser(userId: string): Promise<{ readonly deletedAt: Date }> {
    const deletedAt = new Date();
    await this.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('user')
        .set({ deletedAt: deletedAt.toISOString() })
        .where('id', '=', userId)
        .execute();
      await trx.deleteFrom('session').where('userId', '=', userId).execute();
    });
    return { deletedAt };
  }
}
