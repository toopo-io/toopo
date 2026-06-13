/**
 * The on-read aggregate map view for the Kysely repository (ADR-0020): one
 * bounded tier of containers (package/file/symbol) with their child counts and
 * the trust-split edges projected between them. Project-scoped (ADR-0022 §3).
 */
import type { Kysely } from 'kysely';
import type { GraphDatabase } from '../schema/graph-types.js';
import { selectChildCounts, selectContainerRows, selectProjectedEdges } from './aggregate-sql.js';
import type { MapView, MapViewOptions } from './graph.repository.js';
import { clampLimit } from './graph-page.js';
import { rowToNode } from './graph-records.js';
import type { GraphScope } from './graph-scope.js';

export async function mapView(
  db: Kysely<GraphDatabase>,
  scope: GraphScope,
  options: MapViewOptions,
): Promise<MapView> {
  if (options.level === 'symbol' && options.scope === undefined) {
    throw new Error('mapView: the symbol level requires a file scope');
  }
  const limit = clampLimit(options.limit);
  const containerRows = await selectContainerRows(
    db,
    scope.projectId,
    options.level,
    options.scope,
    limit + 1,
  );
  const truncated = containerRows.length > limit;
  const kept = truncated ? containerRows.slice(0, limit) : containerRows;
  const ids = kept.map((row) => row.id);
  const [counts, edges] = await Promise.all([
    selectChildCounts(db, scope.projectId, options.level, ids),
    selectProjectedEdges(db, scope.projectId, options.level, ids),
  ]);
  const nodes = kept.map((row) => ({
    node: rowToNode(row),
    childCount: counts.get(row.id) ?? 0,
  }));
  return { level: options.level, nodes, edges, truncated };
}
