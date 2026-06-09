#!/usr/bin/env node
import { parseArgs } from './args.js';
import { runCli } from './run.js';

/**
 * The worker executable — a thin shell over the tested CLI core: parse args,
 * run the ingest→persist, print the summary. All logic lives in `parseArgs`/
 * `runCli`; this file does only IO and exit handling.
 */
async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2), process.env);
  const { text } = await runCli(options);
  process.stdout.write(`${text}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
