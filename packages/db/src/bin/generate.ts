/**
 * Maintainer-time: (re)generate the committed Better Auth migration SQL for
 * both backends and write them under `migrations/<backend>/0000_better_auth.sql`.
 *
 * Generation is hermetic — SQLite uses an in-memory libSQL database, Postgres a
 * throwaway testcontainer — so it is reproducible with no external service and
 * the CI drift-check can re-run it and diff against the committed files.
 *
 * Only the auth migration (0000) is generated. The `deletedAt` index (0001) is
 * hand-authored (Better Auth does not emit indexes for additional fields).
 *
 * Run: `pnpm --filter @toopo/db db:generate`
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { LibsqlDialect } from '@libsql/kysely-libsql';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { compileAuthMigrationSql } from '../generate-auth-sql.js';
import { MIGRATIONS_DIR } from '../migrations-dir.js';

const AUTH_MIGRATION_FILE = '0000_better_auth.sql';

async function writeMigration(backend: 'sqlite' | 'postgres', sqlText: string): Promise<void> {
  const dir = path.join(MIGRATIONS_DIR, backend);
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, AUTH_MIGRATION_FILE);
  await writeFile(filePath, sqlText, 'utf8');
  process.stdout.write(`wrote ${path.relative(process.cwd(), filePath)}\n`);
}

async function generateSqlite(): Promise<void> {
  const sqlText = await compileAuthMigrationSql({
    dialect: new LibsqlDialect({ url: ':memory:' }),
    type: 'sqlite',
  });
  await writeMigration('sqlite', sqlText);
}

async function generatePostgres(): Promise<void> {
  const container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const pool = new Pool({ connectionString: container.getConnectionUri() });
  try {
    const sqlText = await compileAuthMigrationSql({
      dialect: new PostgresDialect({ pool }),
      type: 'postgres',
    });
    await writeMigration('postgres', sqlText);
  } finally {
    await pool.end();
    await container.stop();
  }
}

async function main(): Promise<void> {
  await generateSqlite();
  await generatePostgres();
  process.stdout.write('auth migrations generated for sqlite + postgres\n');
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    process.stderr.write(
      `db:generate failed: ${error instanceof Error ? error.stack : String(error)}\n`,
    );
    process.exit(1);
  });
