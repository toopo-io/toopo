/**
 * Owns the single Kysely connection for the whole API (ADR-0017 §1). The same
 * instance backs Better Auth's Kysely adapter and the UserRepository, so auth
 * and application queries share one connection. The backend (SQLite self-host /
 * Postgres cloud) is selected by the DATABASE_URL scheme inside `createDatabase`.
 */
import { Global, Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
import {
  type AuthDatabase,
  createDatabase,
  type KyselyBackendType,
  KyselyUserRepository,
  type ToopoDatabase,
  type UserRepository,
} from '@toopo/db';
import type { Kysely } from 'kysely';
import { Env } from '../../env';

export const USER_REPOSITORY = Symbol.for('toopo.user-repository');

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly handle: ToopoDatabase<AuthDatabase>;

  constructor() {
    this.handle = createDatabase<AuthDatabase>({ databaseUrl: Env.DATABASE_URL });
  }

  get db(): Kysely<AuthDatabase> {
    return this.handle.db;
  }

  /** Better Auth's `database.type` for the active backend. */
  get type(): KyselyBackendType {
    return this.handle.type;
  }

  async onModuleDestroy(): Promise<void> {
    await this.handle.db.destroy();
  }
}

@Global()
@Module({
  providers: [
    DatabaseService,
    {
      provide: USER_REPOSITORY,
      useFactory: (database: DatabaseService): UserRepository =>
        new KyselyUserRepository(database.db),
      inject: [DatabaseService],
    },
  ],
  exports: [DatabaseService, USER_REPOSITORY],
})
export class DatabaseModule {}
