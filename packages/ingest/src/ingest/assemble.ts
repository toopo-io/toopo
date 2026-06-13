/**
 * The pipeline steps shared by the full ingest ({@link ingestProject}) and the
 * incremental/delta ingest ({@link ingestDelta}): file discovery, the resolver's
 * project-model default, the per-file outcome projection, and the Resolve +
 * package-synthesis tail. Both entries differ ONLY in how they produce the parse
 * fragments (parse-everything vs cache-or-parse); everything around that is here,
 * once (zero duplication).
 */

import { resolve } from 'node:path';
import { type AnalysisStatus, type GraphDocument, isFileNode } from '@toopo/core';
import type { LanguagePlugin, ParseResult } from '@toopo/parser';
import {
  type Diagnostic,
  type ProjectModel,
  type ResolverPlugin,
  resolveProject,
} from '@toopo/resolver';
import { discoverFiles } from '../discovery/discover.js';
import { type PackageDir, synthesizePackages } from './synthesize-packages.js';

const EMPTY_PROJECT_MODEL: ProjectModel = { aliases: [], workspacePackages: [] };

/**
 * How a project's `ProjectModel` is built once its files are discovered. Injected,
 * not hard-coded, so the orchestration stays language-agnostic (CLAUDE.md "adding a
 * language = zero pipeline change"): the discovered set is needed to resolve
 * workspace source entries, so the builder receives it.
 */
export type ProjectModelBuilder = (
  discovered: readonly string[],
) => ProjectModel | Promise<ProjectModel>;

/** The Resolve + synthesize inputs both ingest entries inject. */
export interface AssembleOptions {
  readonly resolverPlugins: readonly ResolverPlugin[];
  /** Build the resolver's project model from the discovered files. Defaults to empty. */
  readonly buildProjectModel?: ProjectModelBuilder;
  /**
   * Load the workspace package boundaries for Package-node synthesis (ADR-0015 §2).
   * Omitted (or empty) means no package tier is synthesized — graceful degradation
   * for a non-workspace repo.
   */
  readonly buildPackageLayout?: (
    rootDir: string,
  ) => Promise<readonly PackageDir[]> | readonly PackageDir[];
}

/** One discovered file's parse outcome — pipeline data for metrics, not the graph. */
export interface FileOutcome {
  readonly path: string;
  readonly status: AnalysisStatus;
  readonly reason?: string;
}

/**
 * Discover the language-supported source files under `rootDir`. The directory is
 * normalized once (so discovery, reads, and the project-model builder agree); the
 * include predicate is the union of the language plugins' `matches`.
 */
export async function discoverPaths(
  rootDir: string,
  languagePlugins: readonly LanguagePlugin[],
  gitignore?: boolean,
): Promise<{ readonly base: string; readonly paths: readonly string[] }> {
  const include = (path: string): boolean =>
    languagePlugins.some((plugin) => plugin.matches({ path }));
  const base = resolve(rootDir);
  const paths = await discoverFiles(base, {
    include,
    ...(gitignore !== undefined && { gitignore }),
  });
  return { base, paths };
}

/**
 * Resolve the parse fragments into one connected graph and synthesize the optional
 * package tier (ADR-0015 §2, ADR-0016). The deterministic tail of both ingest
 * entries: a full re-resolve over ALL supplied fragments (resolver v1), so a delta
 * ingest must still pass every file's fragment (changed parsed, unchanged cached).
 */
export async function resolveAndSynthesize(
  fragments: readonly ParseResult[],
  options: AssembleOptions,
  base: string,
  paths: readonly string[],
): Promise<{ readonly document: GraphDocument; readonly diagnostics: readonly Diagnostic[] }> {
  const projectModel = await (options.buildProjectModel?.(paths) ?? EMPTY_PROJECT_MODEL);
  const resolved = resolveProject(fragments, options.resolverPlugins, projectModel);
  const layout = (await options.buildPackageLayout?.(base)) ?? [];
  const document = synthesizePackages(resolved.document, layout);
  return { document, diagnostics: resolved.diagnostics };
}

/** The parse outcome of a fragment's file node — status plus a degradation reason
 *  (so a parse error is named in the report, never silently counted). */
export function fileOutcome(path: string, fragment: ParseResult): FileOutcome {
  const analysis = fragment.document.nodes.find(isFileNode)?.analysis;
  if (analysis === undefined || analysis.status === 'analyzed') {
    return { path, status: analysis?.status ?? 'skipped' };
  }
  return { path, status: analysis.status, reason: analysis.reason };
}
