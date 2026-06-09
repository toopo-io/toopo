import { readFile } from 'node:fs/promises';
import type { Edge, Node } from '@toopo/core';
import type {
  ExtractContext,
  GraphFragment,
  LanguagePlugin,
} from '../../src/plugin/language-plugin';

const GRAMMAR_URL = new URL('../fixtures/grammars/json.wasm', import.meta.url);

/**
 * A neutral, test-only language plugin over the vendored JSON micro-grammar. It
 * lets the language-agnostic parser be exercised end-to-end without any real
 * `lang-*` package — so the parser stays React-free even in its own tests. Each
 * captured object key becomes a `symbol` node contained by the file.
 */
export function createJsonPlugin(): LanguagePlugin {
  return {
    id: 'json-test',
    grammar: { id: 'json-test', load: () => readFile(GRAMMAR_URL) },
    matches: (file) => file.path.endsWith('.json'),
    extract: extractKeys,
  };
}

function extractKeys(ctx: ExtractContext): GraphFragment {
  const query = ctx.query('(pair key: (string (string_content) @key))');
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  for (const capture of query.captures(ctx.tree.rootNode)) {
    const name = capture.node.text;
    const id = ctx.childId([{ name, suffix: 'term' }]);
    nodes.push({
      kind: 'symbol',
      id,
      name,
      subKind: 'test:key',
      location: ctx.locate(capture.node),
      properties: {},
    });
    edges.push({
      kind: 'contains',
      sourceId: ctx.fileId,
      targetId: id,
      provenance: { pass: 'parse', rule: 'json-test/key' },
      resolution: 'deterministic',
    });
  }
  return { nodes, edges, unresolved: [], exports: [], reExports: [] };
}

/**
 * A second test-only plugin that emits a structured `unresolved` import, to
 * prove the parser carries unresolved data through to `ParseResult.unresolved`
 * (ADR-0016 Fork 4) and validates it at the boundary. It reuses the JSON
 * grammar but matches a distinct extension.
 */
export function createUnresolvedPlugin(): LanguagePlugin {
  return {
    id: 'json-unresolved-test',
    grammar: { id: 'json-test', load: () => readFile(GRAMMAR_URL) },
    matches: (file) => file.path.endsWith('.jsonu'),
    extract: extractUnresolved,
  };
}

function extractUnresolved(ctx: ExtractContext): GraphFragment {
  return {
    nodes: [],
    edges: [],
    unresolved: [
      {
        importerFileId: ctx.fileId,
        importerPath: ctx.filePath,
        specifier: './neighbor',
        imported: [{ name: 'Thing', localName: 'Thing', kind: 'named', typeOnly: false }],
        typeOnly: false,
        location: ctx.locate(ctx.tree.rootNode),
      },
    ],
    exports: [],
    reExports: [],
  };
}
