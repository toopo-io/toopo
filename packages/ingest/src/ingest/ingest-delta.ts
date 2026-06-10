/**
 * The incremental (delta) ingest (ADR-0025): re-parse only the files whose bytes
 * changed, reuse the rest from the content-hash parse cache, then FULL-resolve over
 * the complete fragment set (resolver v1). The win is parse-skip — the dominant
 * cost (ADR-0016) — without breaking cross-file resolution, since every file's
 * fragment (changed-parsed or cached) is still handed to the resolver.
 *
 * The content hash is the delta authority (ADR-0025 Decision 2): the cloned tree is
 * hashed per file and, when it is byte-identical to the project's stored graph, the
 * run short-circuits to a true no-op (no parse, no persist) — idempotent on
 * redelivery / retry. The cache is injected as a narrow port so this package never
 * depends on `@toopo/db`.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { GraphDocument } from '@toopo/core';
import {
  createParser,
  deserializeParseResult,
  type GraphParser,
  hashContent,
  type LanguagePlugin,
  PARSE_RESULT_VERSION,
  type ParseResult,
  serializeParseResult,
} from '@toopo/parser';
import type { Diagnostic } from '@toopo/resolver';
import {
  type AssembleOptions,
  discoverPaths,
  type FileOutcome,
  fileOutcome,
  resolveAndSynthesize,
} from './assemble.js';

/**
 * The narrow parse-fragment cache the delta ingest needs (ADR-0025 Decision 3),
 * structurally satisfied by `@toopo/db`'s `ParseFragmentStore`. Defined here so the
 * pipeline depends on a capability, not on the storage package.
 */
export interface ParseFragmentCache {
  getMany(keys: readonly string[]): Promise<ReadonlyMap<string, string>>;
  putMany(entries: ReadonlyMap<string, string>): Promise<void>;
}

export interface DeltaIngestOptions extends AssembleOptions {
  readonly languagePlugins: readonly LanguagePlugin[];
  /** Honor `.gitignore` during discovery. Defaults to true. */
  readonly gitignore?: boolean;
  /** The content-hash parse-fragment cache. */
  readonly cache: ParseFragmentCache;
  /**
   * The project's stored per-file content hashes (`db.getFileContentHashes`), keyed
   * by repo-relative path — compared against the cloned tree for the no-op
   * short-circuit. Empty for a project's first scan (⇒ a full ingest).
   */
  readonly storedHashes: ReadonlyMap<string, string>;
  /** Abort if a single file exceeds this many bytes (resource bound, ADR-0025 §7). */
  readonly maxFileBytes?: number;
  /** Abort if the whole cloned source tree exceeds this many bytes (resource bound). */
  readonly maxTotalBytes?: number;
}

/** A no-op run (the clone is byte-identical to the stored graph) vs a run that
 *  produced a fresh document to persist. */
export type DeltaIngestResult =
  | { readonly status: 'unchanged'; readonly contentHashes: ReadonlyMap<string, string> }
  | {
      readonly status: 'ingested';
      readonly document: GraphDocument;
      readonly diagnostics: readonly Diagnostic[];
      readonly files: readonly FileOutcome[];
      /** The cloned tree's per-file content hash, keyed by repo-relative path. */
      readonly contentHashes: ReadonlyMap<string, string>;
      /** Files parsed fresh this run (cache misses). */
      readonly parsed: number;
      /** Files served from the parse cache (re-parse skipped). */
      readonly cacheHits: number;
    };

/** A source file past this is not real source; abort rather than parse it. */
const DEFAULT_MAX_FILE_BYTES = 8 * 1_024 * 1_024;
/** A cloned tree past this is pathological; abort → the queue dead-letters past cap. */
const DEFAULT_MAX_TOTAL_BYTES = 256 * 1_024 * 1_024;

/** Namespace the content hash by parse-format version so a parser change never
 *  yields a stale cache hit (ADR-0025 Decision 3). */
function cacheKey(contentHash: string): string {
  return `${PARSE_RESULT_VERSION}:${contentHash}`;
}

function mapsEqual(a: ReadonlyMap<string, string>, b: ReadonlyMap<string, string>): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const [key, value] of a) {
    if (b.get(key) !== value) {
      return false;
    }
  }
  return true;
}

interface EnumeratedFile {
  readonly path: string;
  readonly bytes: Uint8Array;
  readonly hash: string;
}

/**
 * Read every discovered file once, hashing it (the delta authority) and enforcing
 * the resource bounds — a single oversized file or an oversized tree aborts the run
 * (ADR-0025 Decision 7) so the queue retries / dead-letters rather than a worker
 * exhausting memory on hostile input.
 */
async function enumerateFiles(
  base: string,
  paths: readonly string[],
  maxFileBytes: number,
  maxTotalBytes: number,
): Promise<readonly EnumeratedFile[]> {
  const files: EnumeratedFile[] = [];
  let total = 0;
  for (const path of paths) {
    const bytes = await readFile(join(base, path));
    if (bytes.byteLength > maxFileBytes) {
      throw new Error(`file "${path}" exceeds the ${maxFileBytes}-byte limit`);
    }
    total += bytes.byteLength;
    if (total > maxTotalBytes) {
      throw new Error(`cloned tree exceeds the ${maxTotalBytes}-byte limit`);
    }
    files.push({ path, bytes, hash: hashContent(bytes) });
  }
  return files;
}

/** Reuse a valid cached fragment, else parse fresh. A corrupt/old-format cache row
 *  is treated as a miss (re-parsed) rather than failing the run (graceful). */
async function loadFragment(
  parser: GraphParser,
  file: EnumeratedFile,
  cachedBlob: string | undefined,
): Promise<{ readonly result: ParseResult; readonly fromCache: boolean }> {
  if (cachedBlob !== undefined) {
    try {
      return { result: deserializeParseResult(cachedBlob), fromCache: true };
    } catch {
      // Stale/corrupt blob — fall through to a fresh parse.
    }
  }
  const result = await parser.parseFile({ path: file.path, bytes: file.bytes });
  return { result, fromCache: false };
}

export async function ingestDelta(
  rootDir: string,
  options: DeltaIngestOptions,
): Promise<DeltaIngestResult> {
  const { base, paths } = await discoverPaths(rootDir, options.languagePlugins, options.gitignore);
  const enumerated = await enumerateFiles(
    base,
    paths,
    options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES,
    options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES,
  );
  const contentHashes = new Map(enumerated.map((file) => [file.path, file.hash]));

  // Short-circuit: the clone is byte-identical to the stored graph → no work.
  if (mapsEqual(contentHashes, options.storedHashes)) {
    return { status: 'unchanged', contentHashes };
  }

  // One batched cache read for every file's key; then cache-or-parse each.
  const cached = await options.cache.getMany(enumerated.map((file) => cacheKey(file.hash)));
  const parser = createParser(options.languagePlugins);
  const fragments: ParseResult[] = [];
  const files: FileOutcome[] = [];
  const toCache = new Map<string, string>();
  let parsed = 0;
  let cacheHits = 0;
  for (const file of enumerated) {
    const key = cacheKey(file.hash);
    const { result, fromCache } = await loadFragment(parser, file, cached.get(key));
    if (fromCache) {
      cacheHits += 1;
    } else {
      parsed += 1;
      toCache.set(key, serializeParseResult(result));
    }
    fragments.push(result);
    files.push(fileOutcome(file.path, result));
  }

  await options.cache.putMany(toCache);
  const { document, diagnostics } = await resolveAndSynthesize(fragments, options, base, paths);
  return { status: 'ingested', document, diagnostics, files, contentHashes, parsed, cacheHits };
}
