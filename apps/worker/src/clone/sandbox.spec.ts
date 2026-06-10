/**
 * B4.3 — the per-job sandbox guarantees cleanup (ADR-0025 Decision 7). Proves the
 * directory is real, is removed on success AND on throw, and that cleanup is
 * idempotent and never throws — so a failed-then-retried job can never leak disk.
 */
import { stat } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { createSandbox, withSandbox } from './sandbox.js';

describe('sandbox', () => {
  it('creates a real temp directory and removes it on cleanup', async () => {
    const sandbox = await createSandbox();
    expect((await stat(sandbox.path)).isDirectory()).toBe(true);
    await sandbox.cleanup();
    await expect(stat(sandbox.path)).rejects.toThrow();
  });

  it('withSandbox removes the directory after the body resolves', async () => {
    let captured = '';
    const value = await withSandbox(async (dir) => {
      captured = dir;
      return 42;
    });
    expect(value).toBe(42);
    await expect(stat(captured)).rejects.toThrow();
  });

  it('withSandbox removes the directory even when the body throws', async () => {
    let captured = '';
    await expect(
      withSandbox(async (dir) => {
        captured = dir;
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    await expect(stat(captured)).rejects.toThrow();
  });

  it('cleanup never throws even if the directory is already gone', async () => {
    const sandbox = await createSandbox();
    await sandbox.cleanup();
    await expect(sandbox.cleanup()).resolves.toBeUndefined();
  });
});
