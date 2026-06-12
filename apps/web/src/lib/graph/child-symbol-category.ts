/**
 * Categorise a symbol's child by its language subKind, for the inspector's
 * Parameters / Local variables / Nested functions sections (F1, inspector side).
 *
 * Web-presentation only (the subKind→category boundary): the subKind string
 * literals are confirmed against `packages/lang-react/src/subkinds.ts` (ADR-0027)
 * but are NEVER imported from lang-react and NEVER added to core/api-contracts. A
 * subKind we do not categorise returns null — it lands in no bucket rather than
 * being guessed.
 */
export type ChildCategory = 'parameter' | 'local' | 'nested';

const CATEGORY_BY_SUBKIND: Readonly<Record<string, ChildCategory>> = {
  'ts:parameter': 'parameter',
  'react:prop': 'parameter',
  'ts:variable': 'local',
  'ts:function': 'nested',
  'react:hook': 'nested',
  'react:component': 'nested',
};

export function childSymbolCategory(subKind?: string): ChildCategory | null {
  return (subKind !== undefined ? CATEGORY_BY_SUBKIND[subKind] : undefined) ?? null;
}
