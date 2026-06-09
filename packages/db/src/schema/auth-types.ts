/**
 * Kysely table types for the Better Auth canonical schema (camelCase columns,
 * matching the committed `0000_better_auth.sql`). These type ONLY our own
 * queries — the soft-delete reads and the RGPD export/erasure. Better Auth uses
 * its adapter's internal typing for auth-flow writes, so this interface is not
 * the source of the schema; the committed migration is (ADR-0017 §3).
 *
 * Cross-backend read reality, normalized at the repository boundary (ADR-0006):
 *   - timestamps: `Date` from Postgres, ISO `string` from libSQL.
 *   - booleans: `boolean` from Postgres, `0 | 1` integer from libSQL.
 * We write timestamps as ISO strings, which both backends accept.
 *
 * This is a small, typecheck-guarded type surface (not DDL). `kysely-codegen`
 * from the migrated DB is the scale-up path when the graph schema lands
 * (Chunk 2).
 */
type DbTimestamp = Date | string;
type DbBoolean = boolean | number;

export interface UserTable {
  id: string;
  name: string;
  email: string;
  emailVerified: DbBoolean;
  image: string | null;
  createdAt: DbTimestamp;
  updatedAt: DbTimestamp;
  deletedAt: DbTimestamp | null;
}

export interface SessionTable {
  id: string;
  expiresAt: DbTimestamp;
  token: string;
  createdAt: DbTimestamp;
  updatedAt: DbTimestamp;
  ipAddress: string | null;
  userAgent: string | null;
  userId: string;
}

export interface AccountTable {
  id: string;
  accountId: string;
  providerId: string;
  userId: string;
  accessToken: string | null;
  refreshToken: string | null;
  idToken: string | null;
  accessTokenExpiresAt: DbTimestamp | null;
  refreshTokenExpiresAt: DbTimestamp | null;
  scope: string | null;
  password: string | null;
  createdAt: DbTimestamp;
  updatedAt: DbTimestamp;
}

export interface VerificationTable {
  id: string;
  identifier: string;
  value: string;
  expiresAt: DbTimestamp;
  createdAt: DbTimestamp;
  updatedAt: DbTimestamp;
}

/** The Kysely database schema for the auth module. */
export interface AuthDatabase {
  user: UserTable;
  session: SessionTable;
  account: AccountTable;
  verification: VerificationTable;
}
