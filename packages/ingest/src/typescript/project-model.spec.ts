import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTypescriptProjectModel } from './project-model';

/** A mini pnpm monorepo: a tsconfig with a path alias and two workspace packages. */
async function buildMonorepo(root: string): Promise<void> {
  await mkdir(join(root, 'packages', 'core', 'src'), { recursive: true });
  await mkdir(join(root, 'packages', 'ui', 'src'), { recursive: true });
  await mkdir(join(root, 'app', 'src'), { recursive: true });
  await writeFile(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - "packages/*"\n');
  await writeFile(
    join(root, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@/*': ['app/src/*'] } } }),
  );
  await writeFile(
    join(root, 'packages', 'core', 'package.json'),
    JSON.stringify({ name: '@mono/core', main: './dist/index.js' }),
  );
  await writeFile(join(root, 'packages', 'core', 'src', 'index.ts'), '');
  await writeFile(
    join(root, 'packages', 'ui', 'package.json'),
    JSON.stringify({ name: '@mono/ui', main: './dist/index.js' }),
  );
  // @mono/ui has NO analyzed source entry → it must be dropped (no guessing).
}

describe('buildTypescriptProjectModel', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'ingest-pm-'));
    await buildMonorepo(root);
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('builds aliases from tsconfig paths and workspace packages from analyzed entries', async () => {
    const discovered = ['packages/core/src/index.ts'];
    const model = await buildTypescriptProjectModel(root, discovered);

    expect(model.aliases).toEqual([{ pattern: '@/*', targets: ['app/src/*'] }]);
    // @mono/core resolves to its analyzed source entry; @mono/ui is dropped.
    expect(model.workspacePackages).toEqual([
      { name: '@mono/core', entry: 'packages/core/src/index.ts' },
    ]);
  });

  it('returns an empty model for a single-package project with no aliases', async () => {
    const solo = await mkdtemp(join(tmpdir(), 'ingest-solo-'));
    await writeFile(join(solo, 'package.json'), JSON.stringify({ name: 'solo' }));
    try {
      const model = await buildTypescriptProjectModel(solo, []);
      expect(model).toEqual({ aliases: [], workspacePackages: [] });
    } finally {
      await rm(solo, { recursive: true, force: true });
    }
  });
});
