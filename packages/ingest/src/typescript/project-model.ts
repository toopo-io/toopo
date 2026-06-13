import type { ProjectModel } from '@toopo/resolver';
import { loadTsconfigAliases } from './tsconfig.js';
import { loadWorkspacePackages } from './workspaces.js';

/**
 * Build the resolver's `ProjectModel` for a TypeScript/React project from its
 * on-disk config (ADR-0016 Fork 2/2b): tsconfig path aliases plus workspace
 * packages. This is the TS-ecosystem adapter — the only part of `@toopo/ingest`
 * that knows about tsconfig and workspaces. The agnostic `ingestProject` takes
 * the model as an injected input, so adding a language needs no change to
 * the orchestration; a new ecosystem provides its own builder like this one.
 *
 * The workspace source-entry probe runs against the already-discovered file set,
 * so a package only counts as internal when its source entry is actually
 * analyzed (the trust principle — no resolution to an unparsed file).
 */
export async function buildTypescriptProjectModel(
  rootDir: string,
  discovered: readonly string[],
): Promise<ProjectModel> {
  const analyzed = new Set(discovered);
  const [aliases, workspacePackages] = await Promise.all([
    Promise.resolve(loadTsconfigAliases(rootDir)),
    loadWorkspacePackages(rootDir, (path) => analyzed.has(path)),
  ]);
  return { aliases, workspacePackages };
}
