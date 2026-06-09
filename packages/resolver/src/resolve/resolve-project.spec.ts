import { FORMAT_VERSION, type GraphDocument, isFileNode } from '@toopo/core';
import { fileSymbolId, type ParseResult } from '@toopo/parser';
import { describe, expect, it } from 'vitest';
import { resolveProject } from './resolve-project.js';

/** A minimal analyzed parse fragment declaring one file node — no edges. */
function fileFragment(path: string): ParseResult {
  const document: GraphDocument = {
    formatVersion: FORMAT_VERSION,
    nodes: [
      {
        kind: 'file',
        id: fileSymbolId(path),
        path,
        contentHash: `hash-${path}`,
        analysis: { status: 'analyzed' },
        properties: {},
      },
    ],
    edges: [],
  };
  return { document, unresolved: [], exports: [], reExports: [] };
}

describe('resolveProject — Slice 0 merge/canonicalize backbone', () => {
  it('unions every fragment into one canonicalized document', () => {
    const result = resolveProject(
      [fileFragment('src/App.tsx'), fileFragment('src/Button.tsx')],
      [],
    );

    expect(result.document.formatVersion).toBe(FORMAT_VERSION);
    expect(result.diagnostics).toEqual([]);

    const filePaths = result.document.nodes
      .filter(isFileNode)
      .map((node) => node.path)
      .sort();
    expect(filePaths).toEqual(['src/App.tsx', 'src/Button.tsx']);
  });

  it('is deterministic — fragment input order does not change the output', () => {
    const a = fileFragment('src/App.tsx');
    const b = fileFragment('src/Button.tsx');

    const forward = resolveProject([a, b], []);
    const reversed = resolveProject([b, a], []);

    expect(JSON.stringify(forward.document)).toBe(JSON.stringify(reversed.document));
  });

  it('returns an empty document for an empty project', () => {
    const result = resolveProject([], []);

    expect(result.document.nodes).toEqual([]);
    expect(result.document.edges).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });
});
