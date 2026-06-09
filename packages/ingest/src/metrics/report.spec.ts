import { describe, expect, it } from 'vitest';
import type { IngestMetrics } from './metrics';
import { formatReportText } from './report';

const metrics: IngestMetrics = {
  discovery: { discovered: 10, analyzed: 8, parseError: 1, unsupported: 1, skipped: 0 },
  graph: {
    nodesByKind: { file: 8, symbol: 12, callSite: 5 },
    symbolsBySubKind: { 'react:component': 4, 'ts:function': 8 },
    edgesByKind: { contains: 17, imports: 9, calls: 5 },
  },
  imports: {
    deterministic: 7,
    inferred: 0,
    external: 1,
    ambiguous: 0,
    unresolved: 1,
    total: 9,
    resolved: 8,
    overallResolutionRate: 8 / 9,
    deterministicShare: 7 / 9,
  },
  relationships: {
    renders: 3,
    calls: 2,
    propBindings: 4,
    argBindings: 1,
    crossFile: 6,
    intraFile: 11,
  },
  parseErrors: [{ path: 'src/new-syntax.ts', reason: 'react: source contains syntax errors.' }],
  timings: { discoverMs: 12, parseMs: 340, resolveMs: 21 },
};

describe('formatReportText', () => {
  it('renders the headline rates separately and lists parse-error causes', () => {
    const text = formatReportText(metrics, 'Toopo self-ingest');

    expect(text).toContain('# Toopo self-ingest');
    expect(text).toContain('overall resolution rate: 88.9%  (8/9)');
    expect(text).toContain('deterministic share:     77.8%  (7/9)');
    expect(text).toContain('src/new-syntax.ts — react: source contains syntax errors.');
    expect(text).toContain('nodes by kind:   callSite=5 file=8 symbol=12');
  });

  it('says "none" when there are no parse errors', () => {
    const clean = { ...metrics, parseErrors: [] };
    expect(formatReportText(clean)).toContain('Parse errors\n  none');
  });
});
