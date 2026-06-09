import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { type AnalysisStatus, type GraphDocument, isFileNode } from '@toopo/core';
import { createParser, type LanguagePlugin, type ParseResult } from '@toopo/parser';
import {
  type Diagnostic,
  type ProjectModel,
  type ResolverPlugin,
  resolveProject,
} from '@toopo/resolver';
import { discoverFiles } from '../discovery/discover.js';

const EMPTY_PROJECT_MODEL: ProjectModel = { aliases: [], workspacePackages: [] };

/**
 * How a project's `ProjectModel` is built once its files are discovered. It is
 * injected, not hard-coded, so the orchestration stays language-agnostic
 * (F-E / CLAUDE.md "adding a language = zero pipeline change"): the discovered
 * set is needed to resolve workspace source entries, so the builder receives it.
 * The TS/React composition root supplies `buildTypescriptProjectModel`; another
 * ecosystem supplies its own.
 */
export type ProjectModelBuilder = (
  discovered: readonly string[],
) => ProjectModel | Promise<ProjectModel>;

export interface IngestOptions {
  readonly languagePlugins: readonly LanguagePlugin[];
  readonly resolverPlugins: readonly ResolverPlugin[];
  /** Build the resolver's project model from the discovered files. Defaults to empty. */
  readonly buildProjectModel?: ProjectModelBuilder;
  /** Honor `.gitignore` during discovery (root + nested). Defaults to true. */
  readonly gitignore?: boolean;
}

/** One discovered file's parse outcome — pipeline data for metrics, not the graph.
 *  `reason` is the degradation cause for a non-`analyzed` status (so a parse
 *  error is named in the report, never silently counted). */
export interface FileOutcome {
  readonly path: string;
  readonly status: AnalysisStatus;
  readonly reason?: string;
}

/** Wall-clock timings per pipeline phase (observability; never part of the graph). */
export interface IngestTimings {
  readonly discoverMs: number;
  readonly parseMs: number;
  readonly resolveMs: number;
}

/**
 * The result of ingesting a project: the resolved `@toopo/core` graph plus the
 * pipeline-only data a validation report needs — per-file outcomes, the
 * resolver's honest unresolved/ambiguous diagnostics, and phase timings. Only
 * `document` is the deterministic artifact (ADR-0016); the rest is metadata.
 */
export interface IngestResult {
  readonly document: GraphDocument;
  readonly diagnostics: readonly Diagnostic[];
  readonly files: readonly FileOutcome[];
  readonly timings: IngestTimings;
}

/**
 * Run the deterministic Parse → Resolve pipeline over a real directory
 * (ADR-0016): discover source files, parse each, build the project model, and
 * resolve into one connected graph. This is the filesystem edge and the
 * pipeline's top; the parser and resolver it composes stay pure. It is
 * language-agnostic — plugins and the project-model builder are injected — so a
 * new language needs no change here.
 *
 * A per-file parse failure degrades that file (ADR-0015 graceful degradation)
 * and is recorded in `files`; it never aborts the run.
 */
export async function ingestProject(
  rootDir: string,
  options: IngestOptions,
): Promise<IngestResult> {
  const include = (path: string): boolean =>
    options.languagePlugins.some((plugin) => plugin.matches({ path }));

  // Normalize once so discovery, reads, and the project-model builder agree.
  const base = resolve(rootDir);
  const discoverStart = performance.now();
  const paths = await discoverFiles(base, {
    include,
    ...(options.gitignore !== undefined && { gitignore: options.gitignore }),
  });
  const parseStart = performance.now();

  const parser = createParser(options.languagePlugins);
  const fragments: ParseResult[] = [];
  const files: FileOutcome[] = [];
  for (const path of paths) {
    const bytes = await readFile(join(base, path));
    const fragment = await parser.parseFile({ path, bytes });
    fragments.push(fragment);
    files.push(fileOutcome(path, fragment));
  }
  const resolveStart = performance.now();

  const projectModel = await (options.buildProjectModel?.(paths) ?? EMPTY_PROJECT_MODEL);
  const { document, diagnostics } = resolveProject(
    fragments,
    options.resolverPlugins,
    projectModel,
  );
  const resolveEnd = performance.now();

  return {
    document,
    diagnostics,
    files,
    timings: {
      discoverMs: parseStart - discoverStart,
      parseMs: resolveStart - parseStart,
      resolveMs: resolveEnd - resolveStart,
    },
  };
}

/** The parse outcome of a fragment's file node — status plus a degradation reason. */
function fileOutcome(path: string, fragment: ParseResult): FileOutcome {
  const analysis = fragment.document.nodes.find(isFileNode)?.analysis;
  if (analysis === undefined || analysis.status === 'analyzed') {
    return { path, status: analysis?.status ?? 'skipped' };
  }
  return { path, status: analysis.status, reason: analysis.reason };
}
