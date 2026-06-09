import { readFile } from 'node:fs/promises';
import { isFileNode } from '@toopo/core';
import { createParser } from '@toopo/parser';
import { describe, expect, it } from 'vitest';
import { createReactPlugin } from './plugin';

const FIXTURE_URL = new URL('../test/fixtures/Counter.tsx', import.meta.url);

describe('createReactPlugin', () => {
  it('matches .tsx files and nothing else (the v1 slice)', () => {
    const plugin = createReactPlugin();
    expect(plugin.matches({ path: 'src/Counter.tsx' })).toBe(true);
    expect(plugin.matches({ path: 'src/Counter.ts' })).toBe(false);
    expect(plugin.matches({ path: 'src/styles.css' })).toBe(false);
  });

  it('parses a real .tsx through the parser + plugin into an analyzed file node', async () => {
    const parser = createParser([createReactPlugin()]);
    const bytes = await readFile(FIXTURE_URL);

    const { document, unresolved } = await parser.parseFile({
      path: 'src/Counter.tsx',
      bytes,
    });

    const file = document.nodes.find(isFileNode);
    expect(file?.analysis).toEqual({ status: 'analyzed' });
    expect(file?.path).toBe('src/Counter.tsx');
    expect(file?.contentHash).toMatch(/^[0-9a-f]{64}$/);
    // The grammar loads and the file parses; its relative import is carried as
    // unresolved for the Resolve pass (the detailed extraction is covered in the
    // extract specs).
    expect(unresolved.map((entry) => entry.specifier)).toEqual(['./Button']);
  });
});
