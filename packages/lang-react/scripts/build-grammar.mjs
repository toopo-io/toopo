import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Reproducible grammar build (ADR-0016). Compiles the vendored
 * `grammars/tsx.wasm` from a PINNED `tree-sitter-typescript` source using a
 * `tree-sitter-cli` whose ABI matches `web-tree-sitter`. Both versions are
 * pinned in this package's devDependencies, so the build is reproducible from
 * the lockfile. The CLI auto-downloads `wasi-sdk` (no native toolchain). This
 * is a maintainer/CI step — NEVER run on install; the `.wasm` ships vendored.
 * See `grammars/PROVENANCE.md` for the pinned versions and reproduction.
 */
const require = createRequire(import.meta.url);
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const tsxGrammarDir = join(dirname(require.resolve('tree-sitter-typescript/package.json')), 'tsx');

const cliPackageJson = require('tree-sitter-cli/package.json');
const cliBin =
  typeof cliPackageJson.bin === 'string' ? cliPackageJson.bin : cliPackageJson.bin['tree-sitter'];
const cliEntry = join(dirname(require.resolve('tree-sitter-cli/package.json')), cliBin);

const outDir = join(packageRoot, 'grammars');
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, 'tsx.wasm');

execFileSync(process.execPath, [cliEntry, 'build', '--wasm', '--output', outFile, tsxGrammarDir], {
  stdio: 'inherit',
});

process.stderr.write(`Built ${outFile}\n  from ${tsxGrammarDir}\n`);
