import type { IngestMetrics } from './metrics.js';

/**
 * Render a human-readable validation report (F-C: the stdout half; the JSON
 * half is the {@link IngestMetrics} object itself). Pure — no clock, no IO — so
 * it is deterministic given the metrics, except timings which the caller may
 * round. The overall resolution rate and the deterministic share are shown
 * separately, per the metrics ruling.
 */
export function formatReportText(
  metrics: IngestMetrics,
  title = 'Ingest validation report',
): string {
  return [
    `# ${title}`,
    '',
    discoverySection(metrics),
    '',
    importsSection(metrics),
    '',
    relationshipsSection(metrics),
    '',
    graphSection(metrics),
    '',
    parseErrorsSection(metrics),
    '',
    timingsSection(metrics),
  ].join('\n');
}

function discoverySection(metrics: IngestMetrics): string {
  const { discovered, analyzed, parseError, unsupported, skipped } = metrics.discovery;
  return [
    'Discovery',
    `  discovered:   ${discovered}`,
    `  analyzed:     ${analyzed}`,
    `  parse-error:  ${parseError}`,
    `  unsupported:  ${unsupported}`,
    `  skipped:      ${skipped}`,
  ].join('\n');
}

function importsSection(metrics: IngestMetrics): string {
  const m = metrics.imports;
  return [
    `Imports (denominator = ${m.total} bindings in parsed files; parse-errored files excluded)`,
    `  overall resolution rate: ${percent(m.overallResolutionRate)}  (${m.resolved}/${m.total})`,
    `  deterministic share:     ${percent(m.deterministicShare)}  (${m.deterministic}/${m.total})`,
    '  breakdown:',
    `    deterministic: ${m.deterministic}`,
    `    inferred:      ${m.inferred}`,
    `    external:      ${m.external}`,
    `    ambiguous:     ${m.ambiguous}`,
    `    unresolved:    ${m.unresolved}`,
  ].join('\n');
}

function relationshipsSection(metrics: IngestMetrics): string {
  const r = metrics.relationships;
  return [
    'Relationships',
    `  renders:       ${r.renders}`,
    `  calls:         ${r.calls}`,
    `  prop bindings: ${r.propBindings}`,
    `  arg bindings:  ${r.argBindings}`,
    `  cross-file (resolve): ${r.crossFile}   intra-file (parse): ${r.intraFile}`,
  ].join('\n');
}

function graphSection(metrics: IngestMetrics): string {
  return [
    'Graph',
    `  nodes by kind:   ${record(metrics.graph.nodesByKind)}`,
    `  symbol subKinds: ${record(metrics.graph.symbolsBySubKind)}`,
    `  edges by kind:   ${record(metrics.graph.edgesByKind)}`,
  ].join('\n');
}

function parseErrorsSection(metrics: IngestMetrics): string {
  if (metrics.parseErrors.length === 0) {
    return 'Parse errors\n  none';
  }
  const lines = metrics.parseErrors.map((cause) => `  ${cause.path} — ${cause.reason}`);
  return ['Parse errors', ...lines].join('\n');
}

function timingsSection(metrics: IngestMetrics): string {
  const { discoverMs, parseMs, resolveMs } = metrics.timings;
  return [
    'Timings',
    `  discover: ${ms(discoverMs)}   parse: ${ms(parseMs)}   resolve: ${ms(resolveMs)}`,
  ].join('\n');
}

function percent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function ms(value: number): string {
  return `${value.toFixed(0)}ms`;
}

/** Render a count record as a compact, key-sorted inline string. */
function record(counts: Readonly<Record<string, number>>): string {
  const entries = Object.entries(counts).sort(([a], [b]) => (a < b ? -1 : 1));
  if (entries.length === 0) {
    return '(none)';
  }
  return entries.map(([key, count]) => `${key}=${count}`).join(' ');
}
