/**
 * Deterministic Package-node synthesis (completes ADR-0015 §2's optional
 * container tier the parse/resolve passes deferred). Given the resolved graph and
 * the workspace's package boundaries (a pnpm/`package.json` workspace — `name` +
 * repo-relative `dir`), this emits one `package` node per package that owns at
 * least one analysed file, plus a `package --contains--> file` edge for each such
 * file. Those `contains` edges are exactly what the Serve map projects the
 * package tier from (childCount and package↔package edges, ADR-0020).
 *
 * It is faithful (the real workspace structure, not a guess) and deterministic
 * (a file maps to the DEEPEST package dir that contains it; output is
 * canonicalized). It degrades gracefully: with no boundaries — or a file under
 * none (a non-workspace repo) — nothing is synthesized and the map's top simply
 * stays at the file level. Pure: the input document is never mutated.
 */
import {
  canonicalizeGraphDocument,
  type Edge,
  type GraphDocument,
  isFileNode,
  type PackageNode,
} from '@toopo/core';

/** A workspace package boundary: its declared name and its repo-relative directory. */
export interface PackageDir {
  readonly name: string;
  readonly dir: string;
}

const SYNTHESIS_RULE = 'workspace/contains-file';

export function synthesizePackages(
  document: GraphDocument,
  packages: readonly PackageDir[],
): GraphDocument {
  if (packages.length === 0) {
    return document;
  }
  // Deepest first, so the first containing dir is the most specific owner.
  const ordered = [...packages].sort((a, b) => segmentCount(b.dir) - segmentCount(a.dir));

  const packageNodesByName = new Map<string, PackageNode>();
  const containsEdges: Edge[] = [];

  for (const node of document.nodes) {
    if (!isFileNode(node)) {
      continue;
    }
    const owner = ordered.find((pkg) => isWithin(node.path, pkg.dir));
    if (owner === undefined) {
      continue; // a file outside every workspace package — left at the file tier
    }
    if (!packageNodesByName.has(owner.name)) {
      packageNodesByName.set(owner.name, {
        kind: 'package',
        id: owner.name,
        name: owner.name,
        properties: {},
      });
    }
    containsEdges.push({
      kind: 'contains',
      sourceId: owner.name,
      targetId: node.id,
      provenance: { pass: 'resolve', rule: SYNTHESIS_RULE },
      resolution: 'deterministic',
    });
  }

  if (packageNodesByName.size === 0) {
    return document;
  }

  return canonicalizeGraphDocument({
    formatVersion: document.formatVersion,
    nodes: [...document.nodes, ...packageNodesByName.values()],
    edges: [...document.edges, ...containsEdges],
  });
}

/** True when `filePath` is the directory `dir` itself or a descendant of it. */
function isWithin(filePath: string, dir: string): boolean {
  return filePath === dir || filePath.startsWith(`${dir}/`);
}

function segmentCount(dir: string): number {
  return dir.split('/').filter((segment) => segment.length > 0).length;
}
