import { canonicalizeGraphDocument, GraphDocumentSchema, isFileNode } from '@toopo/core';
import { describe, expect, it } from 'vitest';
import { createJsonPlugin, createUnresolvedPlugin } from '../../test/support/json-plugin';
import { createParser } from './parse-file';

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

describe('createParser / parseFile', () => {
  it('parses a real file into an analyzed file node plus declared symbols and contains edges', async () => {
    const parser = createParser([createJsonPlugin()]);
    const { document, unresolved } = await parser.parseFile({
      path: 'src/data.json',
      bytes: encode('{"alpha": 1, "beta": 2}'),
    });

    expect(GraphDocumentSchema.safeParse(document).success).toBe(true);
    expect(unresolved).toEqual([]);

    const file = document.nodes.find(isFileNode);
    expect(file?.analysis).toEqual({ status: 'analyzed' });
    expect(file?.contentHash).toMatch(/^[0-9a-f]{64}$/);

    const symbols = document.nodes.filter((node) => node.kind === 'symbol');
    expect(symbols.map((symbol) => symbol.name)).toEqual(['alpha', 'beta']);
    expect(symbols.every((symbol) => symbol.subKind === 'test:key')).toBe(true);
    expect(symbols.every((symbol) => symbol.location !== undefined)).toBe(true);

    const contains = document.edges.filter((edge) => edge.kind === 'contains');
    expect(contains).toHaveLength(2);
    expect(contains.every((edge) => edge.sourceId === file?.id)).toBe(true);
    expect(contains.every((edge) => edge.resolution === 'deterministic')).toBe(true);
  });

  it('is deterministic — the same bytes yield a byte-identical, already-canonical document', async () => {
    const parser = createParser([createJsonPlugin()]);
    const input = { path: 'src/data.json', bytes: encode('{"b": 1, "a": 2}') };

    const first = await parser.parseFile(input);
    const second = await parser.parseFile(input);

    expect(JSON.stringify(first.document)).toBe(JSON.stringify(second.document));
    expect(first.document).toEqual(canonicalizeGraphDocument(first.document));
  });

  it('degrades to unsupported-language when no plugin matches, still carrying a content hash', async () => {
    const parser = createParser([createJsonPlugin()]);
    const { document } = await parser.parseFile({
      path: 'src/script.py',
      bytes: encode('print(1)'),
    });

    const files = document.nodes.filter(isFileNode);
    expect(document.nodes).toHaveLength(1);
    expect(files[0]?.analysis.status).toBe('unsupported-language');
    expect(files[0]?.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(document.edges).toEqual([]);
  });

  it('degrades to parse-error on a syntactically broken file', async () => {
    const parser = createParser([createJsonPlugin()]);
    const { document } = await parser.parseFile({
      path: 'src/broken.json',
      bytes: encode('{ broken'),
    });

    const files = document.nodes.filter(isFileNode);
    expect(document.nodes).toHaveLength(1);
    expect(files[0]?.analysis.status).toBe('parse-error');
  });

  it('passes structured unresolved imports through to the result, validated at the boundary', async () => {
    const parser = createParser([createUnresolvedPlugin()]);
    const { unresolved } = await parser.parseFile({
      path: 'src/widget.jsonu',
      bytes: encode('{"x": 1}'),
    });

    expect(unresolved).toHaveLength(1);
    expect(unresolved[0]?.specifier).toBe('./neighbor');
    expect(unresolved[0]?.imported[0]?.localName).toBe('Thing');
  });
});
