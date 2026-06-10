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
  /**
   * The session's active workspace (ADR-0028), added by the organization
   * plugin. Null until an active organization is set. Toopo sets it from the
   * user's personal workspace on session creation.
   */
  activeOrganizationId: string | null;
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

/**
 * Workspace tenancy tables, owned by the Better Auth organization plugin
 * (ADR-0028). The plugin owns all WRITES (creation, membership, invitations)
 * through its server API; Toopo only ever READS these — chiefly the `member`
 * table for graph-route authorization (Phase 3). Column names track Better
 * Auth's schema verbatim; the product term "Workspace" is applied only at the
 * domain/UI boundary. FKs are emitted within the auth module, consistent with
 * the existing `session`/`account` → `user` references (ADR-0017 §7 forbids
 * only CROSS-module FKs, e.g. project → user/organization).
 */
export interface OrganizationTable {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  metadata: string | null;
  createdAt: DbTimestamp;
}

export interface MemberTable {
  id: string;
  organizationId: string;
  userId: string;
  role: string;
  createdAt: DbTimestamp;
}

export interface InvitationTable {
  id: string;
  organizationId: string;
  email: string;
  role: string | null;
  status: string;
  expiresAt: DbTimestamp;
  inviterId: string;
  createdAt: DbTimestamp;
}

/** The Kysely database schema for the auth module. */
export interface AuthDatabase {
  user: UserTable;
  session: SessionTable;
  account: AccountTable;
  verification: VerificationTable;
  organization: OrganizationTable;
  member: MemberTable;
  invitation: InvitationTable;
}
