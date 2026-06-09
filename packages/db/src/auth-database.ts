/**
 * The auth-persistence surface apps/api depends on (ADR-0017 §1, fork F4: the
 * app never touches Kysely). `createAuthDatabase` builds the single shared
 * connection and hands back exactly what the app needs — the object Better
 * Auth's Kysely adapter expects, the UserRepository, and a close function —
 * so the app obtains all of it from @toopo/db and never names the persistence
 * engine.
 */
import type { Kysely } from 'kysely';
import { createDatabase } from './database.js';
import type { KyselyBackendType } from './dialect.js';
import type { UserRepository } from './repositories/user.repository.js';
import { KyselyUserRepository } from './repositories/user.repository.kysely.js';
import type { AuthDatabase } from './schema/auth-types.js';

/** The `database` value Better Auth's Kysely adapter accepts. */
export interface BetterAuthDatabase {
  readonly db: Kysely<AuthDatabase>;
  readonly type: KyselyBackendType;
}

export interface AuthDatabaseHandle {
  /** Pass straight to `betterAuth({ database })`. */
  readonly betterAuthDatabase: BetterAuthDatabase;
  readonly userRepository: UserRepository;
  /** Closes the underlying connection (call on shutdown). */
  close(): Promise<void>;
}

export function createAuthDatabase(input: unknown): AuthDatabaseHandle {
  const handle = createDatabase<AuthDatabase>(input);
  return {
    betterAuthDatabase: { db: handle.db, type: handle.type },
    userRepository: new KyselyUserRepository(handle.db),
    close: () => handle.db.destroy(),
  };
}
