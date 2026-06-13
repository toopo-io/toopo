/**
 * Explicit migration apply step (ADR-0008: never on boot). Applies the
 * committed, dialect-specific SQL migrations to the database identified by
 * DATABASE_URL — the backend is inferred from its scheme (ADR-0017 §1).
 *
 * Run: `pnpm --filter @toopo/db db:migrate`
 */
import { DatabaseUrlSchema } from '../config.js';
import { createDatabase } from '../database.js';
import { MIGRATIONS_DIR } from '../migrations-dir.js';
import { migrateToLatest } from '../migrator.js';

async function main(): Promise<void> {
  // The same boundary schema every entrypoint validates with (ADR-0006):
  // presence AND a scheme the dialect layer accepts.
  const parsedUrl = DatabaseUrlSchema.safeParse(process.env['DATABASE_URL']);
  if (!parsedUrl.success) {
    throw new Error(
      `db:migrate: ${parsedUrl.error.issues[0]?.message ?? 'DATABASE_URL is not set'}`,
    );
  }

  const { db, backend } = createDatabase({ databaseUrl: parsedUrl.data });
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
