# ADR 0002: TypeScript strict flags

Date: 2026-05-15
Status: Accepted

## Context

TypeScript ships strictness as separate flags so projects can opt into
each. The default `"strict": true` enables most but not all. The
remaining flags trade ergonomics for safety in cases that almost
always indicate a bug.

## Decision

Enable every strict-family flag in `tooling/tsconfig/base.json` so all
extending profiles inherit them:

- `strict: true` — bundles `strictNullChecks`, `noImplicitAny`,
  `strictFunctionTypes`, etc.
- `noUncheckedIndexedAccess: true` — `arr[i]` is `T | undefined`,
  forcing explicit handling. Stops a class of "it worked in dev" bugs.
- `noImplicitOverride: true` — class overrides must use the `override`
  keyword. Catches accidental shadowing.
- `noPropertyAccessFromIndexSignature: true` — `obj.foo` is rejected
  if `foo` is only typed via an index signature; you must write
  `obj['foo']`. Forces a conscious choice between known keys and
  dynamic lookups.
- `verbatimModuleSyntax: true` (where the target supports ESM) —
  `import type` is preserved, side-effect-free type imports never
  emit runtime code.
- `forceConsistentCasingInFileNames: true` — protects against
  case-sensitive deploy targets.

## Consequences

- Refactors become safer: turning a field optional or removing one
  always lights up the call sites.
- New contributors hit early friction with index access and override
  keywords. The friction is itself the value.
- Some library types (`process.env`) require `obj['KEY']` access; we
  treat that as a feature — env reads are explicit.

## Alternatives considered

- Default `strict: true` only — easier to start, but
  `noUncheckedIndexedAccess` in particular has prevented enough bugs
  in similar projects that we want it from day one.
