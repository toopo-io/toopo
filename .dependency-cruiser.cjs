/**
 * Dependency-boundary gate (Verification gate #5, ADR-0015 + the CLAUDE.md
 * dependency rules). Codifies the architecture's hard, one-way boundaries as
 * machine-enforced rules — the config is the living, executable statement of the
 * package graph the repo is allowed to have. Every rule is `error`: a violation
 * fails the gate (CI + lefthook pre-push). Resolution is source-to-source via
 * tsconfig.depcruise.json (mapping each @toopo package to its src), so no build
 * is required.
 *
 * Scope note: this codifies the EXISTING clean boundaries, never tighter. The
 * deterministic engine tier (lang-react/parser/resolver) is consumed by `ingest`
 * (the pipeline driver) and the apps that compose it (the composition roots) —
 * those edges are legitimate and stay allowed. The external-dependency half of
 * ADR-0015 (core has zero runtime deps; zod peer only) is enforced separately by
 * scripts/check-core-manifest.mjs, which the import graph cannot see.
 *
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      comment:
        'No RUNTIME cycles anywhere in the graph (package or file level). `viaOnly` ' +
        'excludes type-only-closed cycles: a cycle that exists only because a leg is ' +
        'an `import type` is idiomatic sibling type-sharing with no runtime or ' +
        'init-order hazard (it is erased at compile), so reporting it would be a false ' +
        'positive — which our trust principle forbids the gate from crying. Type-only ' +
        'BOUNDARY crossings stay enforced: `tsPreCompilationDeps` is on, so the ' +
        'directional rules below still catch e.g. `web -> lang-react` via an import type.',
      severity: 'error',
      from: {},
      to: { circular: true, viaOnly: { dependencyTypesNot: ['type-only'] } },
    },
    {
      name: 'no-reverse-deps',
      comment: 'One-way only: packages/* and tooling/* must never depend on apps/*.',
      severity: 'error',
      from: { path: '^(packages|tooling)/' },
      to: { path: '^apps/' },
    },
    {
      name: 'tooling-is-leaf',
      comment: 'tooling/* are shared configs only — never depend on apps or packages.',
      severity: 'error',
      from: { path: '^tooling/' },
      to: { path: '^(apps|packages)/' },
    },
    {
      name: 'apps-are-leaves',
      comment: 'An app must never depend on another app — apps are leaves of the graph.',
      severity: 'error',
      from: { path: '^apps/([^/]+)/' },
      to: { path: '^apps/', pathNot: '^apps/$1/' },
    },
    {
      name: 'core-is-dependency-light',
      comment:
        'packages/core imports no other workspace package (ADR-0015, import half; the external-dependency half is enforced by check-core-manifest.mjs).',
      severity: 'error',
      from: { path: '^packages/core/' },
      to: { path: '^packages/', pathNot: '^packages/core/' },
    },
    {
      name: 'web-frontend-isolation',
      comment:
        'F1 (isolate what varies): apps/web production source may only reach its declared runtime packages (api-contracts, core, env, i18n, ui) — never the deterministic engine tier (lang-react/parser/resolver/ingest) or db/serve directly. The HTTP API and api-contracts types are the only seam. Tests/e2e are exempt (they wire concrete packages directly).',
      severity: 'error',
      from: { path: '^apps/web/', pathNot: '\\.(spec|test)\\.[jt]sx?$|(^|/)e2e/' },
      to: { path: '^packages/', pathNot: '^packages/(api-contracts|core|env|i18n|ui)/' },
    },
    {
      name: 'web-not-to-lang-react',
      comment: 'Explicit F1: the frontend never imports a language plugin (lang-react).',
      severity: 'error',
      from: { path: '^apps/web/' },
      to: { path: '^packages/lang-react/' },
    },
  ],
  options: {
    // Source-to-source resolution (no build needed); see tsconfig.depcruise.json.
    tsConfig: { fileName: 'tsconfig.depcruise.json' },
    // Type-only imports cross boundaries too — count them.
    tsPreCompilationDeps: true,
    doNotFollow: { path: '(^|/)node_modules(/|$)' },
    exclude: {
      path: '(^|/)(node_modules|dist|\\.next|\\.turbo|coverage|test-results)(/|$)',
    },
    enhancedResolveOptions: {
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
    },
  },
};
