import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import type { GraphDocument } from '@toopo/core';
import { createParser, type LanguagePlugin, type ParseResult } from '@toopo/parser';
import type { Diagnostic } from '@toopo/resolver';
import {
  type AssembleOptions,
  discoverPaths,
  type FileOutcome,
  fileOutcome,
  resolveAndSynthesize,
} from './assemble.js';

export interface IngestOptions extends AssembleOptions {
  readonly languagePlugins: readonly LanguagePlugin[];
  /** Honor `.gitignore` during discovery (root + nested). Defaults to true. */
  readonly gitignore?: boolean;
}

/** Wall-clock timings per pipeline phase (observability; never part of the graph). */
export interface IngestTimings {
  readonly discoverMs: number;
  readonly parseMs: number;
  readonly resolveMs: number;
}

/**
 * The result of ingesting a project: the resolved `@toopo/core` graph plus the
 * pipeline-only data a validation report needs — per-file outcomes, the resolver's
 * honest unresolved/ambiguous diagnostics, and phase timings. Only `document` is
 * the deterministic artifact (ADR-0016); the rest is metadata.
 */
export interface IngestResult {
  readonly document: GraphDocument;
  readonly diagnostics: readonly Diagnostic[];
  readonly files: readonly FileOutcome[];
  readonly timings: IngestTimings;
}

/**
 * Run the deterministic Parse → Resolve pipeline over a real directory (ADR-0016):
 * discover source files, parse EVERY file, build the project model, and resolve
 * into one connected graph. This is the filesystem edge and the pipeline's top; the
 * parser and resolver it composes stay pure. It is language-agnostic — plugins and
 * the project-model builder are injected — so a new language needs no change here.
 * For the per-push incremental path that re-parses only changed files, see
 * {@link ingestDelta}.
 *
 * A per-file parse failure degrades that file (ADR-0015 graceful degradation) and
 * is recorded in `files`; it never aborts the run.
 */
export async function ingestProject(
  rootDir: string,
  options: IngestOptions,
): Promise<IngestResult> {
  const discoverStart = performance.now();
  const { base, paths } = await discoverPaths(rootDir, options.languagePlugins, options.gitignore);
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

  const { document, diagnostics } = await resolveAndSynthesize(fragments, options, base, paths);
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
