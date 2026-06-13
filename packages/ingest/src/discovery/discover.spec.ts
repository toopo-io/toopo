import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { discoverFiles } from './discover';

const TS = (path: string) => path.endsWith('.ts') || path.endsWith('.tsx');

/** Lay down a small tree exercising hard defaults, gitignore, and nesting. */
async function buildTree(root: string): Promise<void> {
  await mkdir(join(root, 'src', 'nested'), { recursive: true });
  await mkdir(join(root, 'node_modules', 'dep'), { recursive: true });
  await mkdir(join(root, 'dist'), { recursive: true });
  await writeFile(join(root, '.gitignore'), 'secret.ts\ngenerated/\n');
  await writeFile(join(root, 'src', 'a.ts'), '');
  await writeFile(join(root, 'src', 'b.tsx'), '');
  await writeFile(join(root, 'src', 'secret.ts'), ''); // gitignored
  await writeFile(join(root, 'src', 'styles.css'), ''); // not a TS source
  await writeFile(join(root, 'src', 'nested', 'c.ts'), '');
  await mkdir(join(root, 'src', 'generated'), { recursive: true });
  await writeFile(join(root, 'src', 'generated', 'gen.ts'), ''); // gitignored dir
  await writeFile(join(root, 'node_modules', 'dep', 'index.ts'), ''); // hard default
  await writeFile(join(root, 'dist', 'out.ts'), ''); // hard default
}

describe('discoverFiles', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'ingest-discover-'));
    await buildTree(root);
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('returns supported sources as sorted repo-relative POSIX paths, honoring ignores', async () => {
    const files = await discoverFiles(root, { include: TS });
    expect(files).toEqual(['src/a.ts', 'src/b.tsx', 'src/nested/c.ts']);
  });

  it('excludes hard-default directories even when .gitignore would not', async () => {
    const all = await discoverFiles(root, { include: () => true, gitignore: false });
    expect(all.some((p) => p.startsWith('node_modules/'))).toBe(false);
    expect(all.some((p) => p.startsWith('dist/'))).toBe(false);
    // With gitignore off, the gitignored sources reappear (only hard defaults gone).
    expect(all).toContain('src/secret.ts');
    expect(all).toContain('src/generated/gen.ts');
  });

  it('is deterministic — repeated runs yield identical ordering', async () => {
    const first = await discoverFiles(root, { include: TS });
    const second = await discoverFiles(root, { include: TS });
    expect(second).toEqual(first);
  });

  it('NEVER surfaces a symlink — a hostile repo cannot point reads outside the tree', async () => {
    // The walk is confined to the real tree (security baseline): downstream
    // reads follow links, so a symlinked "source file" must not be discovered.
    const outside = await mkdtemp(join(tmpdir(), 'ingest-outside-'));
    await writeFile(join(outside, 'host-secret.ts'), 'export const leaked = true;\n');
    try {
      await symlink(join(outside, 'host-secret.ts'), join(root, 'src', 'evil.ts'), 'file');
    } catch {
      // Windows without Developer Mode denies symlink creation — nothing to
      // prove on a host that cannot materialise links (the worker runs Linux,
      // where CI exercises this path).
      await rm(outside, { recursive: true, force: true });
      return;
    }
    try {
      const files = await discoverFiles(root, { include: TS });
      expect(files).not.toContain('src/evil.ts');
    } finally {
      await rm(join(root, 'src', 'evil.ts'), { force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('keeps full subpaths for a bare relative root like "." (regression)', async () => {
    // fdir collapses to basenames on a bare relative crawl root; discoverFiles
    // resolves it to absolute. Guard that subdirectories survive.
    const previous = process.cwd();
    process.chdir(root);
    try {
      const files = await discoverFiles('.', { include: TS });
      expect(files).toEqual(['src/a.ts', 'src/b.tsx', 'src/nested/c.ts']);
    } finally {
      process.chdir(previous);
    }
  });
});
