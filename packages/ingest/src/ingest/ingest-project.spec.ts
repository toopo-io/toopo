import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isFileNode, isPackageNode, isSymbolNode } from '@toopo/core';
import { createReactPlugins, createReactResolver } from '@toopo/lang-react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTypescriptProjectModel } from '../typescript/project-model';
import { ingestProject } from './ingest-project';

const plugins = {
  languagePlugins: createReactPlugins(),
  resolverPlugins: [createReactResolver()],
};

/** A tiny but representative project: a .ts util, a .tsx component, an app that
 *  imports both via a relative path and a tsconfig alias. */
async function buildProject(root: string): Promise<void> {
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(
    join(root, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } } }),
  );
  await writeFile(
    join(root, 'src', 'format.ts'),
    'export function format(n: number): string {\n  return String(n);\n}\n',
  );
  await writeFile(
    join(root, 'src', 'Button.tsx'),
    'interface ButtonProps {\n  label: string;\n}\nexport function Button({ label }: ButtonProps) {\n  return <button>{label}</button>;\n}\n',
  );
  await writeFile(
    join(root, 'src', 'App.tsx'),
    "import { Button } from './Button';\nimport { format } from '@/format';\nexport function App() {\n  return <Button label={format(1)} />;\n}\n",
  );
  await writeFile(join(root, 'src', 'styles.css'), 'body{}'); // ignored: unsupported extension
}

describe('ingestProject', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'ingest-e2e-'));
    await buildProject(root);
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('discovers, parses, and resolves a real project into one graph', async () => {
    const result = await ingestProject(root, {
      ...plugins,
      buildProjectModel: (discovered) => buildTypescriptProjectModel(root, discovered),
    });

    // Only supported sources are ingested; all parse cleanly.
    expect(result.files.map((file) => file.path)).toEqual([
      'src/App.tsx',
      'src/Button.tsx',
      'src/format.ts',
    ]);
    expect(result.files.every((file) => file.status === 'analyzed')).toBe(true);

    // The graph contains the component and the .ts function as symbols.
    const symbols = result.document.nodes.filter(isSymbolNode);
    const button = symbols.find((node) => node.name === 'Button');
    const format = symbols.find((node) => node.name === 'format');
    expect(button?.subKind).toBe('react:component');
    expect(format?.subKind).toBe('ts:function');

    // The relative import (./Button) resolved to an internal cross-file edge.
    const buttonImport = result.document.edges.some(
      (edge) => edge.kind === 'imports' && edge.targetId === button?.id,
    );
    expect(buttonImport).toBe(true);

    // The alias import (@/format) resolved to the .ts function — deterministically.
    const aliasImport = result.document.edges.find(
      (edge) =>
        edge.kind === 'imports' &&
        edge.targetId === format?.id &&
        edge.resolution === 'deterministic',
    );
    expect(aliasImport).toBeDefined();
  });

  it('produces a byte-identical graph across repeated runs (ADR-0016 determinism)', async () => {
    const options = {
      ...plugins,
      buildProjectModel: (discovered: readonly string[]) =>
        buildTypescriptProjectModel(root, discovered),
    };
    const first = await ingestProject(root, options);
    const second = await ingestProject(root, options);
    expect(JSON.stringify(second.document)).toBe(JSON.stringify(first.document));
  });

  it('defaults to an empty project model when none is injected', async () => {
    const result = await ingestProject(root, plugins);
    // Without aliases the @/format import cannot resolve; it stays a diagnostic.
    expect(result.document.nodes.length).toBeGreaterThan(0);
    expect(result.files).toHaveLength(3);
  });

  it('synthesizes a package tier from the injected workspace layout (ADR-0015 §2)', async () => {
    const result = await ingestProject(root, {
      ...plugins,
      buildProjectModel: (discovered) => buildTypescriptProjectModel(root, discovered),
      // This fixture lives under one synthetic package rooted at `src`.
      buildPackageLayout: () => [{ name: '@demo/app', dir: 'src' }],
    });

    const pkg = result.document.nodes.find(isPackageNode);
    expect(pkg).toMatchObject({ kind: 'package', id: '@demo/app', name: '@demo/app' });

    // Every analysed file is contained by the package via a deterministic edge
    // (targets are the files' descriptor ids, not their plain paths).
    const fileIds = result.document.nodes
      .filter(isFileNode)
      .map((node) => node.id)
      .sort();
    const contained = result.document.edges
      .filter((edge) => edge.kind === 'contains' && edge.sourceId === '@demo/app')
      .map((edge) => edge.targetId)
      .sort();
    expect(contained).toEqual(fileIds);
    expect(
      result.document.edges.every(
        (edge) =>
          !(edge.kind === 'contains' && edge.sourceId === '@demo/app') ||
          edge.resolution === 'deterministic',
      ),
    ).toBe(true);
  });

  it('synthesizes no package tier when no layout is injected (graceful fallback)', async () => {
    const result = await ingestProject(root, {
      ...plugins,
      buildProjectModel: (discovered) => buildTypescriptProjectModel(root, discovered),
    });
    expect(result.document.nodes.some(isPackageNode)).toBe(false);
  });
});
