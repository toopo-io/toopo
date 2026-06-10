/**
 * Test-only helper to build a real, local git repository with a scripted history,
 * so the cloner and the loop-closing e2e run OFFLINE against a `file`-transport
 * remote — no network, no GitHub, no private-repo auth (that is B5). The fixture
 * enables fetch-by-sha over the local transport (the same upload-pack config GitHub
 * exposes), so a depth-1 fetch of an exact commit works exactly as in production.
 *
 * Not under `src/`, so it is excluded from the build and from coverage.
 */
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

function fixtureEnv(cwd: string): NodeJS.ProcessEnv {
  return {
    PATH: process.env['PATH'],
    SystemRoot: process.env['SystemRoot'],
    GIT_CONFIG_NOSYSTEM: '1',
    // Nonexistent path ⇒ no user config read; portable (git on Windows rejects
    // `os.devNull` as a config path).
    GIT_CONFIG_GLOBAL: path.join(cwd, '.toopo-no-global-gitconfig'),
    // Identity via env so the fixture never depends on the machine's git config.
    GIT_AUTHOR_NAME: 'Toopo Fixture',
    GIT_AUTHOR_EMAIL: 'fixture@toopo.test',
    GIT_COMMITTER_NAME: 'Toopo Fixture',
    GIT_COMMITTER_EMAIL: 'fixture@toopo.test',
  };
}

/** Whether a usable `git` is on PATH — gate fixture-based suites (skip if absent). */
export function gitAvailable(): boolean {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export interface FixtureCommit {
  readonly message: string;
  /** Repo-relative path → content to write, or `null` to delete the file. */
  readonly files: Readonly<Record<string, string | null>>;
}

export interface FixtureRepo {
  readonly dir: string;
  /** Clone source for `GitCloner`'s `remoteUrl` (a local path, the `file` transport). */
  readonly url: string;
  /** Commit shas in application order (`shas[0]` is the first commit). */
  readonly shas: readonly string[];
  cleanup(): Promise<void>;
}

function git(cwd: string, args: readonly string[]): string {
  return execFileSync('git', [...args], {
    cwd,
    env: fixtureEnv(cwd),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
    .toString()
    .trim();
}

async function applyFiles(dir: string, files: FixtureCommit['files']): Promise<void> {
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(dir, relative);
    if (content === null) {
      await rm(target, { force: true });
    } else {
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content);
    }
  }
}

/** Build a throwaway git repo applying `commits` in order; returns its shas + a
 *  local clone URL. Cleanup removes the directory. */
export async function createFixtureRepo(commits: readonly FixtureCommit[]): Promise<FixtureRepo> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'toopo-fixture-'));
  git(dir, ['init', '--quiet', '--initial-branch=main']);
  // Allow a depth-1 fetch of an exact sha over the local transport, as GitHub does.
  git(dir, ['config', 'uploadpack.allowAnySHA1InWant', 'true']);
  git(dir, ['config', 'uploadpack.allowReachableSHA1InWant', 'true']);

  const shas: string[] = [];
  for (const commit of commits) {
    await applyFiles(dir, commit.files);
    git(dir, ['add', '-A']);
    git(dir, ['commit', '--quiet', '--allow-empty', '--message', commit.message]);
    shas.push(git(dir, ['rev-parse', 'HEAD']));
  }

  return {
    dir,
    url: dir.split(path.sep).join('/'),
    shas,
    async cleanup() {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    },
  };
}
