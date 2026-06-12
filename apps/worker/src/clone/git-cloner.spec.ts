/**
 * B4.3 — GitCloner against a local fixture repo (ADR-0025 Decision 1), OFFLINE via
 * the `file` transport. Proves: it materialises the working tree at the EXACT
 * commit (depth-1 fetch-by-sha), is commit-precise (an earlier sha yields the
 * older tree — immune to the branch advancing), reflects deletes, and rejects both
 * an unknown sha and a missing `git` binary so the queue can retry / dead-letter.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createFixtureRepo,
  type FixtureRepo,
  gitAvailable,
} from '../../test/support/git-fixture.js';
import { GitCloner } from './git-cloner.js';
import { withSandbox } from './sandbox.js';

const SKIP_GIT = !gitAvailable();
if (SKIP_GIT) {
  process.stderr.write('[worker tests] GitCloner suite skipped — git is not on PATH.\n');
}

const REPO = { host: 'github.com', owner: 'toopo', name: 'fixture' } as const;

describe.skipIf(SKIP_GIT)('GitCloner', () => {
  let fixture: FixtureRepo;
  let firstSha: string;
  let secondSha: string;
  let cloner: GitCloner;

  beforeAll(async () => {
    fixture = await createFixtureRepo([
      {
        message: 'c1',
        files: { 'a.ts': 'export const a = 1;\n', 'b.ts': 'export const b = 1;\n' },
      },
      {
        message: 'c2',
        files: { 'a.ts': 'export const a = 2;\n', 'b.ts': null, 'c.ts': 'export const c = 3;\n' },
      },
    ]);
    [firstSha, secondSha] = fixture.shas as [string, string];
    cloner = new GitCloner({ remoteUrl: () => fixture.url, timeoutMs: 60_000 });
  }, 60_000);

  afterAll(async () => {
    await fixture?.cleanup();
  });

  it('materialises the working tree at the exact head commit, reflecting a delete', async () => {
    await withSandbox(async (dir) => {
      await cloner.clone({ repo: REPO, commitSha: secondSha, destination: dir });
      expect(await readFile(path.join(dir, 'a.ts'), 'utf8')).toBe('export const a = 2;\n');
      expect(await readFile(path.join(dir, 'c.ts'), 'utf8')).toBe('export const c = 3;\n');
      // b.ts was deleted in c2 — it must not exist in the c2 tree.
      await expect(readFile(path.join(dir, 'b.ts'), 'utf8')).rejects.toThrow();
    });
  });

  it('is commit-precise: cloning an earlier sha yields that older tree', async () => {
    await withSandbox(async (dir) => {
      await cloner.clone({ repo: REPO, commitSha: firstSha, destination: dir });
      expect(await readFile(path.join(dir, 'a.ts'), 'utf8')).toBe('export const a = 1;\n');
      expect(await readFile(path.join(dir, 'b.ts'), 'utf8')).toBe('export const b = 1;\n');
    });
  });

  it('rejects an unknown commit sha', async () => {
    await withSandbox(async (dir) => {
      await expect(
        cloner.clone({ repo: REPO, commitSha: 'f'.repeat(40), destination: dir }),
      ).rejects.toThrow();
    });
  });

  it('rejects when the git executable cannot be spawned', async () => {
    const broken = new GitCloner({
      remoteUrl: () => fixture.url,
      gitPath: 'toopo-no-such-git-binary',
    });
    await withSandbox(async (dir) => {
      await expect(
        broken.clone({ repo: REPO, commitSha: firstSha, destination: dir }),
      ).rejects.toThrow(/failed to start/);
    });
  });

  it('REJECTS a flag-shaped sha before it can reach git argv (never spawns)', async () => {
    await withSandbox(async (dir) => {
      await expect(
        cloner.clone({ repo: REPO, commitSha: '--upload-pack=/bin/sh', destination: dir }),
      ).rejects.toThrow(/commitSha/);
    });
  });
});
