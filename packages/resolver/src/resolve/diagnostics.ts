import type { SymbolId, UnresolvedReference, UnresolvedReferenceCode } from '@toopo/core';

/**
 * The honest unresolved/ambiguous tail of the Resolve pass (ADR-0016 trust
 * principle). A diagnostic records WHY a dependency could not be bound to a
 * precise symbol, so the gap is explicit rather than silently dropped. It is the
 * core {@link UnresolvedReference} — pipeline data that is now ALSO persisted
 * (ADR-0016 amendment, C11), so a later "unused"/"cycle" view never mistakes a
 * resolution gap for genuine absence. Re-exported under the resolve-pass term.
 */
export type Diagnostic = UnresolvedReference;
export type DiagnosticCode = UnresolvedReferenceCode;

/** The structured target of an `*-export` diagnostic: the resolved module and the
 * export name that did not bind, so the gap is attributable to a known file. */
interface DiagnosticTarget {
  readonly targetFileId?: SymbolId;
  readonly name?: string;
}

/** Build a diagnostic (factory keeps the field order and shape consistent). An
 * `*-export` code carries its resolved {@link DiagnosticTarget}; a `*-module` code
 * has none (the target is outside the graph). */
export function diagnostic(
  code: DiagnosticCode,
  importerFileId: SymbolId,
  specifier: string,
  message: string,
  target: DiagnosticTarget = {},
): Diagnostic {
  return {
    code,
    importerFileId,
    specifier,
    message,
    ...(target.targetFileId === undefined ? {} : { targetFileId: target.targetFileId }),
    ...(target.name === undefined ? {} : { name: target.name }),
  };
}

/** A total, stable order over diagnostics so the tail is deterministic (ADR-0016). */
export function sortDiagnostics(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  return [...diagnostics].sort((a, b) => {
    const fields: readonly [string, string][] = [
      [a.importerFileId, b.importerFileId],
      [a.code, b.code],
      [a.specifier, b.specifier],
      [a.targetFileId ?? '', b.targetFileId ?? ''],
      [a.name ?? '', b.name ?? ''],
      [a.message, b.message],
    ];
    for (const [left, right] of fields) {
      if (left !== right) {
        return left < right ? -1 : 1;
      }
    }
    return 0;
  });
}
