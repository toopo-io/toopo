import { fileURLToPath } from 'node:url';

/**
 * Absolute path to the committed migrations root (`packages/db/migrations`),
 * holding one subdirectory per backend (`sqlite/`, `postgres/`). Resolved from
 * this module's location so it is correct whether run from source (tsx) or the
 * compiled `dist/` — in both layouts this file sits one level under the package
 * root. Migrations are tool-consumed files outside the import graph (ADR-0010
 * category 2); `migrations` is shipped via package.json `files`.
 */
export const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
