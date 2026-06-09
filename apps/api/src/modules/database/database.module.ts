/**
 * Owns the single shared connection for the whole API (ADR-0017 §1). Everything
 * comes from @toopo/db's surface — the object Better Auth's adapter expects, the
 * UserRepository, and a close function — so apps/api never names Kysely or the
 * persistence implementation (fork F4). The backend (SQLite self-host / Postgres
 * cloud) is selected by the DATABASE_URL scheme inside `createAuthDatabase`.
 */
import { Global, Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
import {
  type AuthDatabaseHandle,
  type BetterAuthDatabase,
  createAuthDatabase,
  type UserRepository,
} from '@toopo/db';
import { Env } from '../../env';

export const USER_REPOSITORY = Symbol.for('toopo.user-repository');

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly handle: AuthDatabaseHandle;

  constructor() {
    this.handle = createAuthDatabase({ databaseUrl: Env.DATABASE_URL });
  }

  /** The `database` value passed straight to `betterAuth(...)`. */
  get betterAuthDatabase(): BetterAuthDatabase {
    return this.handle.betterAuthDatabase;
  }

  get userRepository(): UserRepository {
    return this.handle.userRepository;
  }

  async onModuleDestroy(): Promise<void> {
    await this.handle.close();
  }
}

@Global()
@Module({
  providers: [
    DatabaseService,
    {
      provide: USER_REPOSITORY,
      useFactory: (database: DatabaseService): UserRepository => database.userRepository,
      inject: [DatabaseService],
    },
  ],
  exports: [DatabaseService, USER_REPOSITORY],
})
export class DatabaseModule {}
