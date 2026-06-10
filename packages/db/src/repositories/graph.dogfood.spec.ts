/**
 * S7 — dogfood. Ingests one of Toopo's own real packages (@toopo/core) into a
 * graph document, persists it into BOTH backends, and queries blast-radius on a
 * real symbol. It proves the whole Chunk-2 surface end to end on real code and
 * asserts the two backends agree exactly.
 *
 * The target symbol is data-driven, not a hardcoded SCIP id: we pick the
 * in-repo symbol with the highest reverse in-degree (the most depended-on
 * symbol), which is guaranteed to have a non-trivial blast radius and stays
 * correct as the source evolves.
 *
 * Perf probe (required): blast-radius uses a per-path recursive CTE, so a node
 * reachable by many distinct paths is re-expanded once per path (the final
 * GROUP BY still yields the correct set). We measure the row-expansion ratio
 * (raw recursive rows / distinct results) on the real graph to confirm the
 * primitive is not pathologically slow before Serve builds on it.
 */

import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import type { GraphDocument } from '@toopo/core';
import { type Kysely, sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR } from '../migrations-dir.js';
import { migrateToLatest } from '../migrator.js';
import type { GraphDatabase } from '../schema/graph-types.js';
import { type BackendHarness, SKIP_POSTGRES, startBackend } from '../test-support/backends.js';
import { ingestPackage } from '../test-support/ingest-and-store.js';
import { BLAST_PATH_SEPARATOR, blastRadiusCte } from './blast-radius-sql.js';
import { DEFAULT_BLAST_RADIUS_KINDS, DEFAULT_BLAST_RADIUS_MAX_DEPTH } from './graph.repository.js';
import { KyselyGraphRepository } from './graph.repository.kysely.js';

const KINDS = DEFAULT_BLAST_RADIUS_KINDS;

const SCOPE = { projectId: 'proj-dogfood' };

interface BackendMetrics {
  readonly nodes: number;
  readonly edges: number;
  readonly persistMs: number;
  readonly hotSymbolId: string;
  readonly hotInDegree: number;
  readonly radiusSize: number;
  readonly maxDepth: number;
  readonly blastMs: number;
  readonly rowsExpanded: number;
  readonly expansionRatio: number;
  readonly radiusIds: readonly string[];
  /** Per-hit trust split (ADR-0021): how many dependents are certainly vs possibly impacted. */
  readonly certainCount: number;
  readonly possibleCount: number;
  /** Worst path-multiplication seen across the busiest symbols (perf probe). */
  readonly maxRatio: number;
  readonly maxRatioSymbol: string;
  readonly sampledSymbols: number;
}

const HOT_SAMPLE_SIZE = 15;

// Ingest once: the document is backend-independent and deterministic.
const corePackageDir = resolve(process.cwd(), '..', 'core');
const documentPromise: Promise<GraphDocument> = ingestPackage(corePackageDir);

const kindList = sql.join(KINDS.map((kind) => sql`${kind}`));

/** The in-repo symbols most depended on (highest reverse in-degree); deterministic. */
async function topSymbols(
  db: Kysely<GraphDatabase>,
  limit: number,
): Promise<Array<{ id: string; degree: number }>> {
  const { rows } = await sql<{ id: string; degree: number }>`
    select "e"."target_id" as "id", count(*) as "degree"
    from "edge" as "e"
    join "node" as "n" on "n"."id" = "e"."target_id"
    where "n"."kind" = 'symbol' and "e"."kind" in (${kindList})
    group by "e"."target_id"
    order by "degree" desc, "e"."target_id" asc
    limit ${limit}
  `.execute(db);
  return rows.map((row) => ({ id: row.id, degree: Number(row.degree) }));
}

/** Count raw recursive rows vs distinct results — the path-multiplication probe. */
async function measureExpansion(
  db: Kysely<GraphDatabase>,
  startId: string,
): Promise<{ expanded: number; result: number }> {
  const cte = blastRadiusCte({
    projectId: SCOPE.projectId,
    startId,
    kinds: [...KINDS],
    maxDepth: DEFAULT_BLAST_RADIUS_MAX_DEPTH,
  });
  const { rows } = await sql<{ expanded: number; result: number }>`${cte}
    select count(*) as "expanded", count(distinct "node_id") as "result"
    from "blast" where "depth" > 0`.execute(db);
  const row = rows[0];
  return { expanded: Number(row?.expanded ?? 0), result: Number(row?.result ?? 0) };
}

const backends = [
  { backend: 'sqlite' as const, skip: false },
  { backend: 'postgres' as const, skip: SKIP_POSTGRES },
];

const metricsByBackend = new Map<string, BackendMetrics>();

for (const { backend, skip } of backends) {
  describe.skipIf(skip)(`dogfood: ingest @toopo/core and query [${backend}]`, () => {
    let harness: BackendHarness;
    let db: Kysely<GraphDatabase>;
    let repository: KyselyGraphRepository;
    let document: GraphDocument;

    beforeAll(async () => {
      document = await documentPromise;
      harness = await startBackend(backend);
      db = harness.db as unknown as Kysely<GraphDatabase>;
      await migrateToLatest({ db: harness.db, backend, rootDir: MIGRATIONS_DIR });
      repository = new KyselyGraphRepository(db);
    }, 180_000);

    afterAll(async () => {
      await harness?.cleanup();
    });

    it('persists the real graph and captures full dogfood metrics', async () => {
      expect(document.nodes.length).toBeGreaterThan(0);

      const persistStart = performance.now();
      const persisted = await repository.persistGraph(SCOPE, document);
      const persistMs = performance.now() - persistStart;

      const hotSymbols = await topSymbols(db, HOT_SAMPLE_SIZE);
      expect(
        hotSymbols.length,
        'the ingested graph must contain depended-on symbols',
      ).toBeGreaterThan(0);
      const hot = hotSymbols[0];
      if (hot === undefined) {
        return;
      }
      expect(hot.id.includes(BLAST_PATH_SEPARATOR)).toBe(false);

      const blastStart = performance.now();
      const radius = await repository.blastRadius(SCOPE, hot.id);
      const blastMs = performance.now() - blastStart;

      expect(radius.length).toBeGreaterThan(0);
      expect(radius.some((h) => h.nodeId === hot.id)).toBe(false);

      // Every hit carries a valid per-path trust (ADR-0021) — never absent/garbage.
      expect(
        radius.every(
          (h) => h.pathResolution === 'deterministic' || h.pathResolution === 'inferred',
        ),
      ).toBe(true);
      const certainCount = radius.filter((h) => h.pathResolution === 'deterministic').length;
      const possibleCount = radius.length - certainCount;

      const hotProbe = await measureExpansion(db, hot.id);
      expect(hotProbe.result).toBe(radius.length);

      // Perf probe across the busiest symbols: the worst path-multiplication is
      // where dense/diamond fan-in would surface. Correctness holds throughout
      // (result always equals the distinct radius); we are characterizing cost.
      let maxRatio = 0;
      let maxRatioSymbol = hot.id;
      for (const symbol of hotSymbols) {
        const probe = await measureExpansion(db, symbol.id);
        const ratio = probe.result === 0 ? 0 : probe.expanded / probe.result;
        if (ratio > maxRatio) {
          maxRatio = ratio;
          maxRatioSymbol = symbol.id;
        }
      }

      metricsByBackend.set(backend, {
        nodes: persisted.nodes,
        edges: persisted.edges,
        persistMs,
        hotSymbolId: hot.id,
        hotInDegree: hot.degree,
        radiusSize: radius.length,
        maxDepth: Math.max(...radius.map((h) => h.depth)),
        blastMs,
        rowsExpanded: hotProbe.expanded,
        expansionRatio: hotProbe.result === 0 ? 0 : hotProbe.expanded / hotProbe.result,
        radiusIds: radius.map((h) => h.nodeId).sort(),
        certainCount,
        possibleCount,
        maxRatio,
        maxRatioSymbol,
        sampledSymbols: hotSymbols.length,
      });
    }, 180_000);

    it('is idempotent on the real graph', async () => {
      const first = await repository.persistGraph(SCOPE, document);
      const second = await repository.persistGraph(SCOPE, document);
      expect(second).toEqual(first);
    }, 180_000);
  });
}

describe('dogfood: cross-backend identity and perf report', () => {
  it.skipIf(SKIP_POSTGRES)('blast-radius is identical on SQLite and Postgres', () => {
    const sqlite = metricsByBackend.get('sqlite');
    const postgres = metricsByBackend.get('postgres');
    expect(sqlite?.hotSymbolId).toBe(postgres?.hotSymbolId);
    expect(sqlite?.radiusIds).toEqual(postgres?.radiusIds);
    expect(sqlite?.radiusSize).toBe(postgres?.radiusSize);
    // The per-path trust split must be identical across backends (ADR-0021).
    expect(sqlite?.certainCount).toBe(postgres?.certainCount);
    expect(sqlite?.possibleCount).toBe(postgres?.possibleCount);
  });

  it('reports the dogfood metrics', () => {
    const lines = ['', '=== ADR-0017 C2 dogfood — @toopo/core ==='];
    for (const backend of ['sqlite', 'postgres']) {
      const m = metricsByBackend.get(backend);
      if (m === undefined) {
        lines.push(`[${backend}] skipped`);
        continue;
      }
      lines.push(
        `[${backend}] nodes=${m.nodes} edges=${m.edges} persist=${m.persistMs.toFixed(1)}ms`,
        `[${backend}] hot symbol in-degree=${m.hotInDegree} id=${m.hotSymbolId}`,
        `[${backend}] blastRadius size=${m.radiusSize} maxDepth=${m.maxDepth} time=${m.blastMs.toFixed(2)}ms`,
        `[${backend}] trust split: certain=${m.certainCount} possible=${m.possibleCount} (ADR-0021)`,
        `[${backend}] hot-symbol expansion: rows=${m.rowsExpanded} result=${m.radiusSize} ratio=${m.expansionRatio.toFixed(2)}x`,
        `[${backend}] worst expansion over ${m.sampledSymbols} busiest symbols: ratio=${m.maxRatio.toFixed(2)}x at ${m.maxRatioSymbol}`,
      );
    }
    // Surfaced straight to stdout (vitest intercepts console for passing tests);
    // this report is the S7 deliverable.
    process.stdout.write(`${lines.join('\n')}\n`);
    expect(metricsByBackend.size).toBeGreaterThan(0);
  });
});
