import { parseArgs as nodeParseArgs } from 'node:util';

/** Parsed CLI options for the ingest dogfood runner. */
export interface CliOptions {
  readonly rootDir: string;
  readonly gitignore: boolean;
  readonly jsonPath?: string;
  readonly title?: string;
}

export const USAGE = 'Usage: toopo-ingest <dir> [--json <path>] [--no-gitignore] [--title <text>]';

/**
 * Parse the ingest CLI arguments (pure, so it is unit-testable). The single
 * positional is the directory to ingest; flags select the JSON output path, a
 * report title, and whether `.gitignore` is honored. A missing directory or an
 * unknown flag throws with the usage line.
 */
export function parseArgs(args: readonly string[]): CliOptions {
  const { values, positionals } = nodeParseArgs({
    args: [...args],
    allowPositionals: true,
    options: {
      json: { type: 'string' },
      title: { type: 'string' },
      'no-gitignore': { type: 'boolean' },
    },
  });

  const rootDir = positionals[0];
  if (rootDir === undefined) {
    throw new Error(USAGE);
  }
  return {
    rootDir,
    gitignore: values['no-gitignore'] !== true,
    ...(values.json !== undefined && { jsonPath: values.json }),
    ...(values.title !== undefined && { title: values.title }),
  };
}
