/**
 * Database configuration — the backend is inferred from the DATABASE_URL
 * scheme, never a separate flag (ADR-0017 §1: "switch by config, not code";
 * one source of truth that cannot contradict the URL).
 *
 *   postgres:// | postgresql://        -> Postgres (cloud)
 *   libsql://   | sqlite:// | file:    -> SQLite via libSQL (self-host)
 *   :memory:                           -> SQLite in-memory (tests)
 *
 * Validation uses a custom Zod refine rather than `.url()` because libSQL's
 * `file:./toopo.db` and `:memory:` forms are not parseable as standard URLs.
 */
import { z } from 'zod';

export type DatabaseBackend = 'sqlite' | 'postgres';

const POSTGRES_PREFIXES = ['postgres://', 'postgresql://'] as const;
const SQLITE_PREFIXES = ['libsql://', 'sqlite://', 'file:', ':memory:'] as const;

/**
 * Maps a connection string to its backend, or `null` when the scheme is not
 * recognized. Pure and total — never throws.
 */
export function inferBackend(databaseUrl: string): DatabaseBackend | null {
  const url = databaseUrl.trim();
  if (POSTGRES_PREFIXES.some((prefix) => url.startsWith(prefix))) {
    return 'postgres';
  }
  if (SQLITE_PREFIXES.some((prefix) => url.startsWith(prefix))) {
    return 'sqlite';
  }
  return null;
}

export const DatabaseConfigSchema = z.object({
  databaseUrl: z
    .string()
    .trim()
    .min(1, { message: 'DATABASE_URL must not be empty' })
    .refine((value) => inferBackend(value) !== null, {
      message:
        'DATABASE_URL must use a known scheme: postgres://, postgresql://, libsql://, sqlite://, file:, or :memory:',
    }),
});

export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;

/** Validates raw input at the boundary (ADR-0006) and returns a typed config. */
export function parseDatabaseConfig(input: unknown): DatabaseConfig {
  return DatabaseConfigSchema.parse(input);
}

/**
 * Resolves the backend of an already-validated config. The scheme is known to
 * be valid here, so a `null` would be a programming error and is surfaced
 * loudly rather than silently defaulted.
 */
export function resolveBackend(config: DatabaseConfig): DatabaseBackend {
  const backend = inferBackend(config.databaseUrl);
  if (backend === null) {
    throw new Error(`resolveBackend: unreachable — unrecognized scheme in "${config.databaseUrl}"`);
  }
  return backend;
}
