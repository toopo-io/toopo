/**
 * Parse the worker CLI arguments (pure, unit-testable). The single positional is
 * the directory to ingest (an optional leading `ingest` subcommand is accepted,
 * matching `toopo-worker ingest <dir>`); the database URL comes from
 * `--database-url` or, when omitted, the `DATABASE_URL` env. A missing directory
 * or database URL throws with the usage line.
 */
import { parseArgs as nodeParseArgs } from 'node:util';

export interface WorkerCliOptions {
  readonly rootDir: string;
  readonly databaseUrl: string;
  readonly gitignore: boolean;
}

export const USAGE =
  'Usage: toopo-worker ingest <dir> --database-url <url> [--no-gitignore]\n' +
  '  (DATABASE_URL env is used when --database-url is omitted)';

export function parseArgs(
  args: readonly string[],
  env: Readonly<Record<string, string | undefined>> = {},
): WorkerCliOptions {
  const { values, positionals } = nodeParseArgs({
    args: [...args],
    allowPositionals: true,
    options: {
      'database-url': { type: 'string' },
      'no-gitignore': { type: 'boolean' },
    },
  });

  const rest = positionals[0] === 'ingest' ? positionals.slice(1) : positionals;
  const rootDir = rest[0];
  if (rootDir === undefined) {
    throw new Error(USAGE);
  }

  const databaseUrl = values['database-url'] ?? env['DATABASE_URL'];
  if (databaseUrl === undefined || databaseUrl.length === 0) {
    throw new Error(`A database URL is required (--database-url or DATABASE_URL).\n${USAGE}`);
  }

  return { rootDir, databaseUrl, gitignore: values['no-gitignore'] !== true };
}
