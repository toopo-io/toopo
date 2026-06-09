/**
 * The language-namespaced subKinds the React/TS plugin assigns (ADR-0015 §5,
 * Fork 4). `react:*` carries React semantics; `ts:*` carries TypeScript-
 * structural facts. Universal queries ignore these; language-aware queries key
 * on them. Classification (ADR-0016 Fork 6) only ever sets a subKind — never an
 * edge — and prefers the more general `ts:function` when a React role is not
 * clearly established (trust principle).
 */
export const SUBKIND = {
  component: 'react:component',
  hook: 'react:hook',
  function: 'ts:function',
  parameter: 'ts:parameter',
  prop: 'react:prop',
} as const;

export type SymbolSubKind = (typeof SUBKIND)[keyof typeof SUBKIND];
