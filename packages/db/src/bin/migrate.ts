/**
 * Explicit migration apply step (ADR-0008: never on boot). Applies the
 * committed, dialect-specific SQL migrations to the database identified by
 * DATABASE_URL — the backend is inferred from its scheme (ADR-0017 §1).
 *
 * Run: `pnpm --filter @toopo/db db:migrate`
 */
import { createDatabase } from '../database.js';
import { MIGRATIONS_DIR } from '../migrations-dir.js';
import { migrateToLatest } from '../migrator.js';

async function main(): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL'];
  if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
    throw new Error('db:migrate: DATABASE_URL must be set');
  }

  const { db, backend } = createDatabase({ databaseUrl });
  try {
    const results = await migrateToLatest({ db, backend, rootDir: MIGRATIONS_DIR });
    if (results.length === 0) {
      process.stdout.write(`db:migrate: no pending migrations (${backend})\n`);
    }
    for (const result of results) {
      process.stdout.write(`db:migrate: applied ${result.migrationName} (${backend})\n`);
    }
  } finally {
    await db.destroy();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    process.stderr.write(
      `db:migrate failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  });
