/**
 * Dogfood wiring (S7): compose the real Parse -> Resolve pipeline (@toopo/ingest
 * with the TS/React plugins) into a GraphDocument that the GraphRepository then
 * persists. Test-support only — excluded from the build and from coverage, so
 * @toopo/ingest stays a dev-only dependency of @toopo/db (acyclic: ingest never
 * depends on db).
 */
import type { GraphDocument } from '@toopo/core';
import { buildTypescriptProjectModel, ingestProject } from '@toopo/ingest';
import { createReactPlugins, createReactResolver } from '@toopo/lang-react';

/** Ingest a real TS/React package directory into a deterministic graph document. */
export async function ingestPackage(rootDir: string): Promise<GraphDocument> {
  const result = await ingestProject(rootDir, {
    languagePlugins: createReactPlugins(),
    resolverPlugins: [createReactResolver()],
    buildProjectModel: (discovered) => buildTypescriptProjectModel(rootDir, discovered),
  });
  return result.document;
}
