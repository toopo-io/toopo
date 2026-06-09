export {
  type AuthDatabaseHandle,
  type BetterAuthDatabase,
  createAuthDatabase,
} from './auth-database.js';
export { authAdditionalUserFields, authSchemaOptions } from './auth-schema.js';
export {
  type DatabaseBackend,
  type DatabaseConfig,
  DatabaseConfigSchema,
  inferBackend,
  parseDatabaseConfig,
  resolveBackend,
} from './config.js';
export { createDatabase, type ToopoDatabase } from './database.js';
export { buildDialect, type KyselyBackendType, type ResolvedDialect } from './dialect.js';
export { MIGRATIONS_DIR } from './migrations-dir.js';
export {
  type MigrateOptions,
  migrateToLatest,
  SqlFileMigrationProvider,
  splitSqlStatements,
} from './migrator.js';
export {
  type BlastRadiusHit,
  type BlastRadiusOptions,
  DEFAULT_BLAST_RADIUS_KINDS,
  DEFAULT_BLAST_RADIUS_MAX_DEPTH,
  type GraphRepository,
  type Neighbor,
  type NeighborDirection,
  type PersistGraphResult,
} from './repositories/graph.repository.js';
export { KyselyGraphRepository } from './repositories/graph.repository.kysely.js';
export type { UserRepository } from './repositories/user.repository.js';
export { KyselyUserRepository } from './repositories/user.repository.kysely.js';
export {
  type AccountRecord,
  AccountRecordSchema,
  type SessionRecord,
  SessionRecordSchema,
  type UserRecord,
  UserRecordSchema,
} from './repositories/user-records.js';
export type {
  AccountTable,
  AuthDatabase,
  SessionTable,
  UserTable,
  VerificationTable,
} from './schema/auth-types.js';
export type { EdgeTable, GraphDatabase, NodeTable } from './schema/graph-types.js';
