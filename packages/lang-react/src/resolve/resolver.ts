import type { ResolverPlugin } from '@toopo/resolver';
import { bindCallSite } from './bind-call-site.js';
import { resolveExport } from './export-resolution.js';
import { resolveModule } from './module-resolution.js';

/**
 * The React/TypeScript Resolve-pass plugin (ADR-0016) — the cross-file half of
 * the language, paired with `createReactPlugins` (the Parse half). It owns all TS
 * resolution semantics: relative module resolution, direct export resolution,
 * and call-site/prop binding. The agnostic engine drives it and mints its edges,
 * never upgrading the certainty it returns (the trust guarantee). The slice is
 * `.ts` + `.tsx`, matching the Parse plugins; its module/export/call semantics
 * are extension-agnostic, so one resolver serves both.
 */
export function createReactResolver(): ResolverPlugin {
  return {
    id: 'react',
    matches: (file) => file.path.endsWith('.ts') || file.path.endsWith('.tsx'),
    resolveModule,
    resolveExport,
    bindCallSite,
  };
}
