import type { SymbolId } from '@toopo/core';

/**
 * The honest unresolved/ambiguous tail of the Resolve pass (ADR-0016 trust
 * principle). A diagnostic is pipeline data — like the parser's `unresolved` —
 * and is deliberately NOT part of the persisted graph model: it records WHY a
 * dependency could not be bound to a precise symbol, so the gap is explicit
 * rather than silently dropped.
 */
export type DiagnosticCode =
  | 'unresolved-module'
  | 'ambiguous-module'
  | 'unresolved-export'
  | 'ambiguous-export';

export interface Diagnostic {
  readonly code: DiagnosticCode;
  readonly importerFileId: SymbolId;
  readonly specifier: string;
  readonly message: string;
}

/** Build a diagnostic (factory keeps the field order and shape consistent). */
export function diagnostic(
  code: DiagnosticCode,
  importerFileId: SymbolId,
  specifier: string,
  message: string,
): Diagnostic {
  return { code, importerFileId, specifier, message };
}

/** A total, stable order over diagnostics so the tail is deterministic (ADR-0016). */
export function sortDiagnostics(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  return [...diagnostics].sort((a, b) => {
    const fields: readonly [string, string][] = [
      [a.importerFileId, b.importerFileId],
      [a.code, b.code],
      [a.specifier, b.specifier],
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
