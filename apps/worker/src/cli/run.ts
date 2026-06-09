/**
 * The worker CLI core (testable): run the ingest→persist composition for the
 * parsed options and format a human-readable summary. All IO and process
 * concerns live in `bin.ts`; this stays pure-ish (one DB write) and returns text.
 */
import { ingestAndPersist } from '../ingest-and-persist.js';
import type { WorkerCliOptions } from './args.js';

export interface CliRunResult {
  readonly text: string;
}

export async function runCli(options: WorkerCliOptions): Promise<CliRunResult> {
  const result = await ingestAndPersist(options);
  const text = [
    `Ingested ${options.rootDir}`,
    `  files processed:      ${result.files}`,
    `  persisted:            ${result.persisted.nodes} nodes, ${result.persisted.edges} edges`,
    `  resolver diagnostics: ${result.diagnostics}`,
  ].join('\n');
  return { text };
}
