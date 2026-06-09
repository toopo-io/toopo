import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadWorkspacePackages } from './workspaces';

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
});
