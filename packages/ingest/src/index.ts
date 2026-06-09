export { type DiscoverOptions, discoverFiles } from './discovery/discover.js';
export { buildIgnoreFilter, type GitignoreSources } from './discovery/ignore-filter.js';
export {
  type FileOutcome,
  type IngestOptions,
  type IngestResult,
  type IngestTimings,
  ingestProject,
  type ProjectModelBuilder,
} from './ingest/ingest-project.js';
export { buildTypescriptProjectModel } from './typescript/project-model.js';
export { loadTsconfigAliases } from './typescript/tsconfig.js';
export { matchesWorkspaceGlobs } from './typescript/workspace-globs.js';
export { loadWorkspacePackages } from './typescript/workspaces.js';
