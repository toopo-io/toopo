/**
 * A per-job sandbox directory for untrusted clone content (ADR-0025 Decision 7,
 * security baseline). Each job clones into a fresh `mkdtemp` directory and
 * {@link withSandbox} GUARANTEES cleanup in a `finally`, even when the handler
 * throws — so a failed-then-retried job never leaks disk. The content inside is
 * only ever read (parsed), never executed.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export interface Sandbox {
  /** The absolute path of the created temp directory. */
  readonly path: string;
  /** Remove the directory and everything under it (best-effort, never throws). */
  cleanup(): Promise<void>;
}

export async function createSandbox(prefix = 'toopo-clone-'): Promise<Sandbox> {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  return {
    path: dir,
    async cleanup() {
      try {
        await rm(dir, { recursive: true, force: true });
      } catch {
        // Best-effort: Windows may briefly hold a handle; the OS reclaims the temp
        // dir regardless. Cleanup failure must never mask the job's real outcome.
      }
    },
  };
}

/**
 * Run `fn` with a fresh sandbox directory, removing it afterwards whether `fn`
 * resolves or throws. The single place clone content is acquired, so cleanup is
 * structurally guaranteed and can never be forgotten at a call site.
 */
export async function withSandbox<T>(
  fn: (directory: string) => Promise<T>,
  prefix?: string,
): Promise<T> {
  const sandbox = await createSandbox(prefix);
  try {
    return await fn(sandbox.path);
  } finally {
    await sandbox.cleanup();
  }
}
