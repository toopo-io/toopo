import { createReactPlugins, createReactResolver } from '@toopo/lang-react';
import { ingestProject } from '../ingest/ingest-project.js';
import { computeMetrics, type IngestMetrics } from '../metrics/metrics.js';
import { formatReportText } from '../metrics/report.js';
import { buildTypescriptProjectModel } from '../typescript/project-model.js';
import type { CliOptions } from './args.js';

export interface CliRunResult {
  readonly text: string;
  readonly metrics: IngestMetrics;
}

/**
 * The TS/React composition root: it wires the concrete language plugins
 * and the TS-specific project-model builder, runs the agnostic `ingestProject`,
 * and renders the validation report. Returning the text and metrics (rather than
 * printing) keeps it testable; the executable shell does the IO.
 */
export async function runCli(options: CliOptions): Promise<CliRunResult> {
  const result = await ingestProject(options.rootDir, {
    languagePlugins: createReactPlugins(),
    resolverPlugins: [createReactResolver()],
    buildProjectModel: (discovered) => buildTypescriptProjectModel(options.rootDir, discovered),
    gitignore: options.gitignore,
  });
  const metrics = computeMetrics(result);
  const text = formatReportText(metrics, options.title);
  return { text, metrics };
}
