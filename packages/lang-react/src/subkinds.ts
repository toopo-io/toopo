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
  variable: 'ts:variable',
  type: 'ts:type',
  interface: 'ts:interface',
  class: 'ts:class',
  /** A class or interface method (incl. constructor and abstract method signatures). */
  method: 'ts:method',
  /** A `get` accessor — name-distinct from its paired setter via the id disambiguator. */
  getter: 'ts:getter',
  /** A `set` accessor — name-distinct from its paired getter via the id disambiguator. */
  setter: 'ts:setter',
  /** A class field / property declaration. */
  field: 'ts:field',
  /** An interface property signature. */
  property: 'ts:property',
} as const;

export type SymbolSubKind = (typeof SUBKIND)[keyof typeof SUBKIND];
