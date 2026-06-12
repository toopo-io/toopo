/**
 * Native-`git` implementation of {@link RepoCloner} (ADR-0025 Decision 1). `git`
 * is spawned with an ARGV array and `shell: false` — never a shell string — so a
 * repo coordinate or sha can never be interpreted as a command (no injection); the
 * sha is already validated to a hex SHA by B3, and the env is locked down so the
 * clone cannot read host credentials, run hooks/LFS filters, or use an unexpected
 * transport. The clone is a `--depth 1` fetch of the exact commit: no history, no
 * tags, the minimum bytes needed to parse the tree.
 *
 * `git` is a documented RUNTIME prerequisite of the consume path only (ADR-0025);
 * it needs no compiler, unlike the install-time native builds the self-host mandate
 * rejects.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { COMMIT_SHA_PATTERN, type RepoCoordinates } from '@toopo/queue';
import { prepareAskpass } from './git-askpass.js';
import type { CloneRequest, RepoCloner } from './repo-cloner.js';

/** Default per-invocation wall-clock bound — a slow/hung clone is killed and the
 *  job retried/dead-lettered rather than pinning a worker (ADR-0025 Decision 7). */
const DEFAULT_TIMEOUT_MS = 120_000;

/** Cap on captured stderr so a hostile remote cannot balloon worker memory. */
const MAX_STDERR_BYTES = 8_192;

export interface GitClonerOptions {
  /**
   * Build the clone URL from repo coordinates. Defaults to the HTTPS GitHub URL
   * `https://${host}/${owner}/${name}.git` — tokenless even for a private repo,
   * whose auth flows through `GIT_ASKPASS` (ADR-0026 §5), never the URL. Injected
   * in tests to point at a local fixture path (the `file` transport).
   */
  readonly remoteUrl?: (repo: RepoCoordinates) => string;
  /** Per-`git`-invocation timeout in ms. Defaults to {@link DEFAULT_TIMEOUT_MS}. */
  readonly timeoutMs?: number;
  /** The `git` executable to spawn. Defaults to `'git'` (resolved on `PATH`). */
  readonly gitPath?: string;
}

function defaultRemoteUrl(repo: RepoCoordinates): string {
  return `https://${repo.host}/${repo.owner}/${repo.name}.git`;
}

/**
 * A locked-down environment for every `git` invocation (ADR-0025 Decision 7):
 * never prompt for credentials, ignore system AND user git config (so no
 * credential helper or hook path leaks in), skip LFS smudge (no filter process),
 * and allow only the `file`/`https` transports (no `ext::`, `ssh`, etc.). Only the
 * variables `git` genuinely needs to run are forwarded.
 */
function hardenedEnv(cwd: string, extraEnv?: Readonly<Record<string, string>>): NodeJS.ProcessEnv {
  return {
    PATH: process.env['PATH'],
    // Windows: git/curl/schannel need SystemRoot to resolve and open sockets.
    SystemRoot: process.env['SystemRoot'],
    GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_NOSYSTEM: '1',
    // Point global config at a NONEXISTENT path so git reads no user config (no
    // credential helper / hook leak) — portable, unlike `os.devNull`, which git on
    // Windows rejects as a config path.
    GIT_CONFIG_GLOBAL: path.join(cwd, '.toopo-no-global-gitconfig'),
    GIT_LFS_SKIP_SMUDGE: '1',
    GIT_ALLOW_PROTOCOL: 'file:https',
    // The GIT_ASKPASS credential channel for a private clone (ADR-0026 §5). Added
    // last so it cannot override the hardening above; GIT_TERMINAL_PROMPT stays 0,
    // so git uses askpass non-interactively. The token lives only here, never argv.
    ...extraEnv,
  };
}

/** The subcommand token (first non-flag arg) for a readable, secret-free error. */
function subcommand(args: readonly string[]): string {
  return args.find((arg) => !arg.startsWith('-')) ?? 'git';
}

function runGit(
  gitPath: string,
  args: readonly string[],
  cwd: string,
  timeoutMs: number,
  extraEnv?: Readonly<Record<string, string>>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(gitPath, [...args], {
      cwd,
      shell: false,
      timeout: timeoutMs,
      env: hardenedEnv(cwd, extraEnv),
      windowsHide: true,
    });
    let stderr = '';
    child.stderr.on('data', (data: Buffer) => {
      if (stderr.length < MAX_STDERR_BYTES) {
        stderr += data.toString('utf8');
      }
    });
    child.on('error', (error) => {
      reject(new Error(`git ${subcommand(args)} failed to start: ${error.message}`));
    });
    child.on('close', (code, signal) => {
      if (signal !== null) {
        reject(new Error(`git ${subcommand(args)} timed out or was killed (${signal})`));
      } else if (code !== 0) {
        reject(new Error(`git ${subcommand(args)} exited ${code}: ${stderr.trim()}`));
      } else {
        resolve();
      }
    });
  });
}

export class GitCloner implements RepoCloner {
  private readonly remoteUrl: (repo: RepoCoordinates) => string;
  private readonly timeoutMs: number;
  private readonly gitPath: string;

  constructor(options: GitClonerOptions = {}) {
    this.remoteUrl = options.remoteUrl ?? defaultRemoteUrl;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.gitPath = options.gitPath ?? 'git';
  }

  async clone(request: CloneRequest): Promise<void> {
    if (!COMMIT_SHA_PATTERN.test(request.commitSha)) {
      // Re-asserted at the port (belt and suspenders to the enqueue/claim Zod
      // boundaries): a hex-only sha can never be parsed as a `git` flag below.
      throw new Error('commitSha must be a full lowercase hex SHA-1 (40) or SHA-256 (64)');
    }
    const url = this.remoteUrl(request.repo);
    const dir = request.destination;
    // For a private repo, the installation token is fed through GIT_ASKPASS (env
    // only) — the remote URL stays the plain `https://host/owner/repo.git`, so no
    // token ever lands in argv, the URL, or a ref (ADR-0026 §5, fork F4).
    const askpass = request.credentials ? await prepareAskpass(request.credentials) : null;
    try {
      const env = askpass?.env;
      // init → add remote → depth-1 fetch of the EXACT sha → detached checkout.
      // Fetching the sha (not a branch) makes the clone commit-precise and immune to
      // the branch advancing between enqueue and processing. Hooks are disabled on
      // checkout (hooksPath → a nonexistent path) so no repo-supplied hook can run.
      await this.git(['init', '--quiet'], dir, env);
      await this.git(['remote', 'add', 'origin', url], dir, env);
      await this.git(
        [
          '-c',
          'protocol.version=2',
          'fetch',
          '--depth',
          '1',
          '--no-tags',
          'origin',
          request.commitSha,
        ],
        dir,
        env,
      );
      await this.git(
        [
          '-c',
          `core.hooksPath=${path.join(dir, '.toopo-no-hooks')}`,
          '-c',
          'advice.detachedHead=false',
          'checkout',
          '--quiet',
          '--force',
          'FETCH_HEAD',
        ],
        dir,
        env,
      );
    } finally {
      await askpass?.cleanup();
    }
  }

  private git(
    args: readonly string[],
    cwd: string,
    extraEnv?: Readonly<Record<string, string>>,
  ): Promise<void> {
    return runGit(this.gitPath, args, cwd, this.timeoutMs, extraEnv);
  }
}
