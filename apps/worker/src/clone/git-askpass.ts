/**
 * The `GIT_ASKPASS` credential channel for private clones (ADR-0026 §5, fork F4).
 * The installation token is fed to `git` through an out-of-band askpass program,
 * NEVER the remote URL, the argv, or a git ref — the channels that leak into
 * process listings, `.git/config`, refs, and logs. The token reaches the askpass
 * program through environment variables set on the `git` child only; the program
 * itself (and the URL/argv) hold no secret, so even reading the written files
 * discloses nothing.
 *
 * Cross-platform without a compiler: a tiny Node askpass script does the logic, and
 * a generated platform wrapper (`.cmd` on Windows, `.sh` on POSIX) execs the
 * current Node binary on it — `GIT_ASKPASS` must point at a directly-executable
 * program, which a bare `.mjs` is not. Everything lives in a per-clone temp dir,
 * removed in `cleanup()`.
 */
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/** Credentials for an authenticated clone (GitHub: username `x-access-token`). */
export interface CloneCredentials {
  readonly username: string;
  readonly password: string;
}

/** Env var the askpass script reads the username from (set on the git child only). */
export const ASKPASS_USERNAME_ENV = 'TOOPO_GIT_ASKPASS_USERNAME';
/** Env var the askpass script reads the password (the token) from. */
export const ASKPASS_PASSWORD_ENV = 'TOOPO_GIT_ASKPASS_PASSWORD';

export interface AskpassSetup {
  /** Env additions for the `git` child: `GIT_ASKPASS` + the credential vars. */
  readonly env: Readonly<Record<string, string>>;
  /** Remove the temp askpass dir (call in `finally`). Best-effort. */
  cleanup(): Promise<void>;
}

/**
 * The askpass program (secret-free): emit the username on a "Username" prompt and
 * the password otherwise, reading both from the environment. `git` passes the
 * prompt string as argv[2] and trims a trailing newline from the output.
 */
function askpassScriptSource(): string {
  return [
    "const prompt = process.argv[2] ?? '';",
    'const isUsername = /^username/i.test(prompt);',
    `const value = isUsername ? process.env['${ASKPASS_USERNAME_ENV}'] : process.env['${ASKPASS_PASSWORD_ENV}'];`,
    "process.stdout.write(value ?? '');",
    '',
  ].join('\n');
}

/** The platform wrapper that execs Node on the askpass script (no secret). */
function wrapper(
  nodePath: string,
  scriptPath: string,
): { readonly name: string; readonly content: string } {
  if (process.platform === 'win32') {
    return { name: 'askpass.cmd', content: `@echo off\r\n"${nodePath}" "${scriptPath}" %*\r\n` };
  }
  return { name: 'askpass.sh', content: `#!/bin/sh\nexec "${nodePath}" "${scriptPath}" "$@"\n` };
}

/**
 * Write the askpass program + wrapper to a fresh temp dir and return the env that
 * wires `git` to it. The token lives only in {@link ASKPASS_PASSWORD_ENV}; the
 * written files contain no secret.
 */
export async function prepareAskpass(credentials: CloneCredentials): Promise<AskpassSetup> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'toopo-askpass-'));
  const scriptPath = path.join(dir, 'askpass.mjs');
  await writeFile(scriptPath, askpassScriptSource(), { mode: 0o600 });

  const { name, content } = wrapper(process.execPath, scriptPath);
  const wrapperPath = path.join(dir, name);
  await writeFile(wrapperPath, content, { mode: 0o700 });
  if (process.platform !== 'win32') {
    await chmod(wrapperPath, 0o700);
  }

  return {
    env: {
      GIT_ASKPASS: wrapperPath,
      [ASKPASS_USERNAME_ENV]: credentials.username,
      [ASKPASS_PASSWORD_ENV]: credentials.password,
    },
    async cleanup(): Promise<void> {
      try {
        await rm(dir, { recursive: true, force: true });
      } catch {
        // Temp-dir cleanup is best-effort; the OS reclaims the temp space regardless.
      }
    },
  };
}
