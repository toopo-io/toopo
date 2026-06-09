import type { ReExport } from '@toopo/parser';
import type { Certainty, ExportIndex, ExportRequest, ExportResolution } from '@toopo/resolver';

/**
 * Resolve an exported name within a module-resolved file to the symbol it binds,
 * SINGLE HOP (ADR-0016 Fork 3); the engine orchestrates the chain. Resolution
 * order, and its trust calibration:
 *
 *   1. a DIRECT local export → the symbol, `deterministic`;
 *   2. an explicit NAMED re-export (`export { X } from`) of the name → a
 *      `re-export` redirect, `deterministic` (the mapping is explicit). Two
 *      explicit re-exports of one name → `ambiguous` (no edge);
 *   3. otherwise a STAR re-export (`export * from`): exactly one source → an
 *      `inferred` redirect (a wildcard, not a proof); two or more → a
 *      `multi-star` deferral the engine resolves by probing each star target for
 *      the name (exactly one provider → deterministic, ≥2 → ambiguous, none →
 *      tail). We never pick one of equals.
 *
 * A namespace re-export (`export * as ns from`) provides a namespace object, not
 * a single named symbol, so it is not matched here — honestly unresolved.
 */
export function resolveExport(request: ExportRequest, index: ExportIndex): ExportResolution {
  const local = index.localExport(request.fileId, request.exportedName);
  if (local !== undefined) {
    return { status: 'symbol', symbolId: local, certainty: { resolution: 'deterministic' } };
  }
  return matchReExport(index.reExports(request.fileId), request.exportedName);
}

interface NamedMatch {
  readonly reExport: ReExport;
  readonly sourceName: string;
}

function matchReExport(reExports: readonly ReExport[], name: string): ExportResolution {
  const named = explicitNamedMatches(reExports, name);
  const [firstNamed] = named;
  if (named.length === 1 && firstNamed !== undefined) {
    return redirect(firstNamed.reExport, firstNamed.sourceName, { resolution: 'deterministic' });
  }
  if (named.length > 1) {
    return { status: 'ambiguous', candidates: named.map((match) => match.reExport.specifier) };
  }

  const stars = reExports.filter((reExport) => reExport.kind === 'star');
  const [firstStar] = stars;
  if (firstStar === undefined) {
    return {
      status: 'unresolved',
      reason: `"${name}" is not a local export, named re-export, or star re-export.`,
    };
  }
  if (stars.length === 1) {
    // A lone wildcard is trusted but not proven — inferred (the engine recurses).
    return redirect(firstStar, name, { resolution: 'inferred', confidence: 'high' });
  }
  // Two or more `export *`: the engine probes each star target for the name (it
  // holds the module index); a single proven provider is deterministic.
  return {
    status: 'multi-star',
    specifiers: stars.map((reExport) => reExport.specifier),
    importerPath: firstStar.exporterPath,
    exportedName: name,
  };
}

/** Explicit `export { … as name } from` matches for the given re-exported name. */
function explicitNamedMatches(reExports: readonly ReExport[], name: string): NamedMatch[] {
  const matches: NamedMatch[] = [];
  for (const reExport of reExports) {
    if (reExport.kind !== 'named') {
      continue;
    }
    for (const binding of reExport.bindings) {
      if (binding.exportedAs === name) {
        matches.push({ reExport, sourceName: binding.name });
      }
    }
  }
  return matches;
}

function redirect(
  reExport: ReExport,
  exportedName: string,
  certainty: Certainty,
): ExportResolution {
  return {
    status: 're-export',
    specifier: reExport.specifier,
    importerPath: reExport.exporterPath,
    exportedName,
    certainty,
  };
}
