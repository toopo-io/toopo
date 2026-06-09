/**
 * Maintainer-time auth-migration generator. Produces the dialect-specific SQL
 * for the Better Auth tables PROGRAMMATICALLY from the *installed* better-auth
 * (via `getMigrations(...).compileMigrations()`), not the standalone
 * `@better-auth/cli` — which still lags the runtime (1.4.x vs 1.6.x) and would
 * reintroduce ADR-0012's conformance-loss hazard. The version that runs auth
 * is the version that authors the schema (ADR-0017 §3, §4).
 *
 * The returned SQL is the committed artifact applied verbatim by our Kysely
 * runner (literal ADR-0017 §4: committed SQL is the source of truth). The CI
 * drift-check re-runs this and fails on any diff, closing the drift-detection
 * gap ADR-0012 left open.
 */
import { getMigrations } from 'better-auth/db/migration';
import type { Dialect } from 'kysely';
import { authSchemaOptions } from './auth-schema.js';
import type { KyselyBackendType } from './dialect.js';

export interface CompileAuthMigrationParams {
  /** A dialect connected to an EMPTY database of the matching backend. */
  readonly dialect: Dialect;
  readonly type: KyselyBackendType;
}

export async function compileAuthMigrationSql(params: CompileAuthMigrationParams): Promise<string> {
  const { compileMigrations } = await getMigrations({
    database: { dialect: params.dialect, type: params.type },
    // Mirrors the runtime factory's schema-affecting config exactly.
    emailAndPassword: { enabled: true },
    ...authSchemaOptions,
  });
  const sql = (await compileMigrations()).trim();
  return `${sql}\n`;
}
