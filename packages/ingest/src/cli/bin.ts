#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { parseArgs } from './args.js';
import { runCli } from './run.js';

/**
 * The ingest dogfood executable — a thin shell over the tested CLI core: parse
 * args, run, print the report, optionally write the metrics JSON. All logic
 * lives in `parseArgs`/`runCli`; this file does only IO and exit handling.
 */
async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const { text, metrics } = await runCli(options);
  process.stdout.write(`${text}\n`);
  if (options.jsonPath !== undefined) {
    await writeFile(options.jsonPath, `${JSON.stringify(metrics, null, 2)}\n`, 'utf8');
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
