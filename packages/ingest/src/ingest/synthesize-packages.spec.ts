import { type GraphDocument, isPackageNode } from '@toopo/core';
import { describe, expect, it } from 'vitest';
import { type PackageDir, synthesizePackages } from './synthesize-packages.js';

function fileNode(path: string) {
  return {
    kind: 'file' as const,
    id: path,
    path,
    contentHash: 'h',
    analysis: { status: 'analyzed' as const },
    properties: {},
  };
}

const BASE: GraphDocument = {
  formatVersion: 1,
  nodes: [
    fileNode('apps/web/src/page.tsx'),
    fileNode('packages/core/src/index.ts'),
    fileNode('README.md'),
  ],
  edges: [],
};

const PACKAGES: PackageDir[] = [
  { name: '@toopo/web', dir: 'apps/web' },
  { name: '@toopo/core', dir: 'packages/core' },
];

describe('synthesizePackages', () => {
  it('emits one package node per package that owns a file, plus package→file contains edges', () => {
    const result = synthesizePackages(BASE, PACKAGES);
    const packages = result.nodes.filter(isPackageNode);
    expect(packages.map((p) => p.id).sort()).toEqual(['@toopo/core', '@toopo/web']);

    const contains = result.edges.filter((e) => e.kind === 'contains');
    expect(contains).toContainEqual({
      kind: 'contains',
      sourceId: '@toopo/web',
      targetId: 'apps/web/src/page.tsx',
      provenance: { pass: 'resolve', rule: 'workspace/contains-file' },
      resolution: 'deterministic',
    });
    // The non-workspace file (README.md) is owned by no package.
    expect(contains.some((e) => e.targetId === 'README.md')).toBe(false);
  });

  it('maps a file to the DEEPEST containing package dir', () => {
    const nested: PackageDir[] = [
      { name: '@apps/root', dir: 'apps' },
      { name: '@toopo/web', dir: 'apps/web' },
    ];
    const result = synthesizePackages(BASE, nested);
    const edge = result.edges.find((e) => e.targetId === 'apps/web/src/page.tsx');
    expect(edge?.sourceId).toBe('@toopo/web');
  });

  it('does not corrupt file ownership via segment-aware prefixing (apps/web ≠ apps/web-foo)', () => {
    const doc: GraphDocument = {
      formatVersion: 1,
      nodes: [fileNode('apps/web-foo/a.ts')],
      edges: [],
    };
    const result = synthesizePackages(doc, [{ name: '@toopo/web', dir: 'apps/web' }]);
    expect(result.nodes.filter(isPackageNode)).toHaveLength(0);
  });

  it('returns the document unchanged when there are no workspace boundaries', () => {
    expect(synthesizePackages(BASE, [])).toBe(BASE);
  });

  it('returns the document unchanged when no file is under any package', () => {
    const doc: GraphDocument = { formatVersion: 1, nodes: [fileNode('scripts/x.ts')], edges: [] };
    expect(synthesizePackages(doc, PACKAGES)).toBe(doc);
  });

  it('is deterministic — same input yields a byte-identical (canonical) result', () => {
    expect(synthesizePackages(BASE, PACKAGES)).toEqual(synthesizePackages(BASE, PACKAGES));
  });
});
