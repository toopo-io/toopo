/**
 * B4.4 — the delta engine (ADR-0025). Proves: a first scan parses every file and
 * fills the cache; a re-run with the same stored hashes short-circuits to a no-op
 * (zero parse, zero put); a partial change re-parses only the changed/new files
 * while UNCHANGED files are served from the cache (the parse-skip win); a deletion
 * drops from the result; and the resource bound aborts an oversized file. Uses a
 * real temp project + the React plugins; the cache is an in-memory
 * ParseFragmentCache that records which keys are written — only PARSED files are
 * put, so an absent key proves a file was NOT re-parsed (a reliable spy, unlike
 * mocking an ESM export).
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isSymbolNode } from '@toopo/core';
import { createReactPlugins, createReactResolver } from '@toopo/lang-react';
import { PARSE_RESULT_VERSION } from '@toopo/parser';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildTypescriptProjectModel } from '../typescript/project-model.js';
import { ingestDelta, type ParseFragmentCache } from './ingest-delta.js';

/** In-memory ParseFragmentCache (the @toopo/db store's contract) that records the
 *  keys written by the most recent putMany — the parse-skip spy. */
class MemoryCache implements ParseFragmentCache {
  readonly map = new Map<string, string>();
  lastPutKeys: string[] = [];
  async getMany(keys: readonly string[]): Promise<ReadonlyMap<string, string>> {
    const out = new Map<string, string>();
    for (const key of keys) {
      const value = this.map.get(key);
      if (value !== undefined) {
        out.set(key, value);
      }
    }
    return out;
  }
  async putMany(entries: ReadonlyMap<string, string>): Promise<void> {
    this.lastPutKeys = [...entries.keys()];
    for (const [key, value] of entries) {
      this.map.set(key, value);
    }
  }
}

const EMPTY = new Map<string, string>();

function keyFor(hash: string): string {
  return `${PARSE_RESULT_VERSION}:${hash}`;
}

function hashOf(hashes: ReadonlyMap<string, string>, path: string): string {
  const hash = hashes.get(path);
  if (hash === undefined) {
    throw new Error(`no content hash for ${path}`);
  }
  return hash;
}

describe('ingestDelta', () => {
  let root: string;
  let cache: MemoryCache;

  function options(storedHashes: ReadonlyMap<string, string>) {
    return {
      languagePlugins: createReactPlugins(),
      resolverPlugins: [createReactResolver()],
      buildProjectModel: (discovered: readonly string[]) =>
        buildTypescriptProjectModel(root, discovered),
      cache,
      storedHashes,
    };
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ingest-delta-'));
    cache = new MemoryCache();
    await mkdir(join(root, 'src'), { recursive: true });
    await writeFile(join(root, 'src', 'a.ts'), 'export const a = 1;\n');
    await writeFile(join(root, 'src', 'b.ts'), 'export const b = 2;\n');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('first scan parses every file, fills the cache, and returns the graph', async () => {
    const result = await ingestDelta(root, options(EMPTY));
    expect(result.status).toBe('ingested');
    if (result.status !== 'ingested') return;
    expect(result.parsed).toBe(2);
    expect(result.cacheHits).toBe(0);
    expect(cache.map.size).toBe(2);
    expect(result.contentHashes.size).toBe(2);
    const names = result.document.nodes.filter(isSymbolNode).map((node) => node.name);
    expect(names).toContain('a');
    expect(names).toContain('b');
  });

  it('short-circuits to a no-op when the clone matches the stored hashes', async () => {
    const first = await ingestDelta(root, options(EMPTY));
    if (first.status !== 'ingested') throw new Error('expected ingested');

    cache.lastPutKeys = [];
    const second = await ingestDelta(root, options(first.contentHashes));

    expect(second.status).toBe('unchanged');
    // True no-op: nothing re-parsed, so nothing re-cached.
    expect(cache.lastPutKeys).toEqual([]);
  });

  it('re-parses only changed/new files; unchanged files are cache hits (no re-parse)', async () => {
    const first = await ingestDelta(root, options(EMPTY));
    if (first.status !== 'ingested') throw new Error('expected ingested');

    // Change a.ts, add c.ts, leave b.ts untouched.
    await writeFile(join(root, 'src', 'a.ts'), 'export const a = 99;\n');
    await writeFile(join(root, 'src', 'c.ts'), 'export const c = 3;\n');

    const second = await ingestDelta(root, options(first.contentHashes));
    expect(second.status).toBe('ingested');
    if (second.status !== 'ingested') return;

    // a.ts changed + c.ts new ⇒ 2 parsed; b.ts unchanged ⇒ a cache hit, never parsed.
    expect(second.parsed).toBe(2);
    expect(second.cacheHits).toBe(1);
    // Only parsed files are put — b.ts's key must be absent (proof of no re-parse).
    expect(cache.lastPutKeys).toContain(keyFor(hashOf(second.contentHashes, 'src/a.ts')));
    expect(cache.lastPutKeys).toContain(keyFor(hashOf(second.contentHashes, 'src/c.ts')));
    expect(cache.lastPutKeys).not.toContain(keyFor(hashOf(second.contentHashes, 'src/b.ts')));
  });

  it('reflects a deletion: a removed file leaves the result and the hash set', async () => {
    const first = await ingestDelta(root, options(EMPTY));
    if (first.status !== 'ingested') throw new Error('expected ingested');

    await rm(join(root, 'src', 'b.ts'));
    const second = await ingestDelta(root, options(first.contentHashes));

    expect(second.status).toBe('ingested');
    if (second.status !== 'ingested') return;
    expect([...second.contentHashes.keys()]).toEqual(['src/a.ts']);
    const names = second.document.nodes.filter(isSymbolNode).map((node) => node.name);
    expect(names).toContain('a');
    expect(names).not.toContain('b');
  });

  it('aborts when a file exceeds the per-file byte bound (resource guard)', async () => {
    await expect(ingestDelta(root, { ...options(EMPTY), maxFileBytes: 4 })).rejects.toThrow(
      /exceeds the 4-byte limit/,
    );
  });
});
