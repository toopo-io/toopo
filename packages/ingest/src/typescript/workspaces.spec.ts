import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadWorkspacePackageDirs, loadWorkspacePackages } from './workspaces';

const created: string[] = [];

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'ingest-ws-'));
  created.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('loadWorkspacePackages', () => {
  const always = () => true;

  it('reads globs from the package.json `workspaces` array', async () => {
    const root = await makeRoot();
    await writeFile(join(root, 'package.json'), JSON.stringify({ workspaces: ['libs/*'] }));
    await mkdir(join(root, 'libs', 'kit', 'src'), { recursive: true });
    await writeFile(
      join(root, 'libs', 'kit', 'package.json'),
      JSON.stringify({ name: '@x/kit', main: './src/index.ts' }),
    );

    const result = await loadWorkspacePackages(root, always);
    expect(result).toEqual([{ name: '@x/kit', entry: 'libs/kit/src/index.ts' }]);
  });

  it('reads globs from the package.json `workspaces.packages` object form', async () => {
    const root = await makeRoot();
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({ workspaces: { packages: ['libs/*'] } }),
    );
    await mkdir(join(root, 'libs', 'kit', 'src'), { recursive: true });
    await writeFile(join(root, 'libs', 'kit', 'package.json'), JSON.stringify({ name: '@x/kit' }));
    await writeFile(join(root, 'libs', 'kit', 'src', 'index.ts'), '');

    const result = await loadWorkspacePackages(root, (p) => p === 'libs/kit/src/index.ts');
    expect(result).toEqual([{ name: '@x/kit', entry: 'libs/kit/src/index.ts' }]);
  });

  it('drops an unnamed workspace package', async () => {
    const root = await makeRoot();
    await writeFile(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - "libs/*"\n');
    await mkdir(join(root, 'libs', 'anon', 'src'), { recursive: true });
    await writeFile(
      join(root, 'libs', 'anon', 'package.json'),
      JSON.stringify({ version: '1.0.0' }),
    );

    const result = await loadWorkspacePackages(root, always);
    expect(result).toEqual([]);
  });

  it('returns nothing when there is no workspace config at all', async () => {
    const root = await makeRoot();
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'solo' }));

    const result = await loadWorkspacePackages(root, always);
    expect(result).toEqual([]);
  });

  it('returns name+dir for every named workspace package (unfiltered by entry)', async () => {
    const root = await makeRoot();
    await writeFile(
      join(root, 'pnpm-workspace.yaml'),
      'packages:\n  - "apps/*"\n  - "packages/*"\n',
    );
    await mkdir(join(root, 'apps', 'web'), { recursive: true });
    await mkdir(join(root, 'packages', 'core'), { recursive: true });
    await writeFile(
      join(root, 'apps', 'web', 'package.json'),
      JSON.stringify({ name: '@toopo/web' }),
    );
    await writeFile(
      join(root, 'packages', 'core', 'package.json'),
      JSON.stringify({ name: '@toopo/core' }),
    );
    // An unnamed package is excluded (it cannot be a container we can name).
    await mkdir(join(root, 'packages', 'anon'), { recursive: true });
    await writeFile(
      join(root, 'packages', 'anon', 'package.json'),
      JSON.stringify({ version: '1' }),
    );

    const dirs = await loadWorkspacePackageDirs(root);
    expect([...dirs].sort((a, b) => a.dir.localeCompare(b.dir))).toEqual([
      { name: '@toopo/web', dir: 'apps/web' },
      { name: '@toopo/core', dir: 'packages/core' },
    ]);
  });

  it('returns no dirs when there is no workspace config', async () => {
    const root = await makeRoot();
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'solo' }));
    expect(await loadWorkspacePackageDirs(root)).toEqual([]);
  });

  it('reads the exports map into subpath exports (Fix C2)', async () => {
    const root = await makeRoot();
    await writeFile(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - "libs/*"\n');
    await mkdir(join(root, 'libs', 'ui', 'src', 'components'), { recursive: true });
    await writeFile(
      join(root, 'libs', 'ui', 'package.json'),
      JSON.stringify({
        name: '@x/ui',
        exports: {
          './components/button': { import: './dist/components/button.js' },
          './globals.css': './src/styles/globals.css',
        },
      }),
    );

    const result = await loadWorkspacePackages(
      root,
      (p) => p === 'libs/ui/src/components/button.tsx',
    );
    expect(result).toEqual([
      {
        name: '@x/ui',
        subpathExports: [
          { subpath: 'components/button', entry: 'libs/ui/src/components/button.tsx' },
        ],
      },
    ]);
  });
});
