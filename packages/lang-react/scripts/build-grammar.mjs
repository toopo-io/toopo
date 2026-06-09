import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Reproducible grammar build (ADR-0016). Compiles the vendored grammars from a
 * PINNED `tree-sitter-typescript` source using a `tree-sitter-cli` whose ABI
 * matches `web-tree-sitter`. Both versions are pinned in this package's
 * devDependencies, so the build is reproducible from the lockfile. The CLI
 * auto-downloads `wasi-sdk` (no native toolchain). This is a maintainer/CI step
 * — NEVER run on install; the `.wasm` files ship vendored. See
 * `grammars/PROVENANCE.md` for the pinned versions and reproduction.
 *
 * `tree-sitter-typescript` ships two grammars: `tsx` parses JSX, while
 * `typescript` parses `.ts` (the `tsx` grammar misreads `.ts` type assertions
 * `<T>x` as JSX, so the split is required — ADR-0016 Part 1). Both are built
 * here from the same pinned source and CLI.
 */
const require = createRequire(import.meta.url);
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const grammarSourceRoot = dirname(require.resolve('tree-sitter-typescript/package.json'));

const cliPackageJson = require('tree-sitter-cli/package.json');
const cliBin =
  typeof cliPackageJson.bin === 'string' ? cliPackageJson.bin : cliPackageJson.bin['tree-sitter'];
const cliEntry = join(dirname(require.resolve('tree-sitter-cli/package.json')), cliBin);

const outDir = join(packageRoot, 'grammars');
mkdirSync(outDir, { recursive: true });

/** The grammars to build: each subdir of `tree-sitter-typescript` → one `.wasm`. */
const GRAMMARS = [
  { sourceSubdir: 'tsx', outFile: 'tsx.wasm' },
  { sourceSubdir: 'typescript', outFile: 'typescript.wasm' },
];

for (const { sourceSubdir, outFile } of GRAMMARS) {
  const sourceDir = join(grammarSourceRoot, sourceSubdir);
  const target = join(outDir, outFile);
  execFileSync(process.execPath, [cliEntry, 'build', '--wasm', '--output', target, sourceDir], {
    stdio: 'inherit',
  });
  process.stderr.write(`Built ${target}\n  from ${sourceDir}\n`);
}
