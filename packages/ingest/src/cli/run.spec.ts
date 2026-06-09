import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runCli } from './run';

describe('runCli', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'ingest-cli-'));
    await mkdir(join(root, 'src'), { recursive: true });
    await writeFile(
      join(root, 'src', 'Widget.tsx'),
      "import { useState } from 'react';\nexport function Widget() {\n  const [n] = useState(0);\n  return <span>{n}</span>;\n}\n",
    );
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('ingests a directory and renders a report with metrics', async () => {
    const { text, metrics } = await runCli({ rootDir: root, gitignore: true, title: 'Smoke' });

    expect(text).toContain('# Smoke');
    expect(metrics.discovery.discovered).toBe(1);
    expect(metrics.discovery.analyzed).toBe(1);
    // The bare `react` import is an external resolution.
    expect(metrics.imports.external).toBeGreaterThanOrEqual(1);
  });
});
